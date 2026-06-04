import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import locks from '@data-fair/lib-node/locks.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import mongo from '#mongo'
import config from '#config'
import { filesStorage } from '../files-storage/index.ts'
import { extractTarballToDir } from './extract.ts'
import { osvScanner, type Scanner } from './runner.ts'

let scanner: Scanner = osvScanner
// Test seam: swap the scanner implementation (no production caller).
export const __setScanner = (s: Scanner) => { scanner = s }

// In-process concurrency gate.
let active = 0
const waiters: (() => void)[] = []
const acquireSlot = async () => {
  if (active >= (config.scanning?.concurrency ?? 1)) {
    await new Promise<void>(resolve => waiters.push(resolve))
  }
  active++
}
const releaseSlot = () => {
  active--
  const next = waiters.shift()
  if (next) next()
}

const setStatus = (id: string, scan: Record<string, unknown>) =>
  mongo.artefacts.updateOne({ _id: id }, { $set: { scan } })

// Mark an artefact pending and kick a background scan. Never throws to the
// caller; failures are recorded on the doc.
export const enqueueScan = async (id: string): Promise<void> => {
  if (!config.scanning?.enabled) return
  // Dotted paths so a re-queue keeps the previously-known summary visible until
  // the new scan finishes, rather than blanking it while pending.
  await mongo.artefacts.updateOne(
    { _id: id },
    { $set: { 'scan.status': 'pending', 'scan.queuedAt': new Date().toISOString() } }
  )
  // Fire-and-forget; do not block the upload response.
  runScanNow(id).catch(err => internalError('scan', err))
}

// Run a full scan synchronously (used by the background task + rescanAll).
export const runScanNow = async (id: string, opts: { refreshDb?: boolean } = {}): Promise<void> => {
  if (!config.scanning?.enabled) return
  const lockId = `scan-${id}`
  if (!await locks.acquire(lockId)) return // another instance/worker has it
  await acquireSlot()
  let dir: string | undefined
  try {
    const artefact = await mongo.artefacts.findOne({ _id: id })
    if (!artefact || artefact.format !== 'npm' || !artefact.path) return

    await setStatus(id, { ...artefact.scan, status: 'running', startedAt: new Date().toISOString() })
    if (opts.refreshDb) await scanner.refreshDb()

    const { body } = await filesStorage.readStream(artefact.path)
    dir = await mkdtemp(join(tmpdir(), 'osv-scan-'))
    await extractTarballToDir(body, dir, { maxEntries: config.maxTarEntries ?? 100000 })

    const result = await scanner.scanDir(dir)
    const now = new Date().toISOString()

    await mongo.artefactScans.replaceOne(
      { _id: id },
      {
        scannedAt: now,
        scannerVersion: result.scannerVersion,
        ...(result.vulnDbUpdatedAt ? { vulnDbUpdatedAt: result.vulnDbUpdatedAt } : {}),
        vulnerabilities: result.vulnerabilities,
        ...(result.licenses.length ? { licenses: result.licenses } : {})
      },
      { upsert: true }
    )
    await setStatus(id, {
      status: 'success',
      finishedAt: now,
      scannerVersion: result.scannerVersion,
      ...(result.vulnDbUpdatedAt ? { vulnDbUpdatedAt: result.vulnDbUpdatedAt } : {}),
      hasInstallScripts: result.hasInstallScripts,
      summary: result.summary
    })
  } catch (err) {
    await setStatus(id, { status: 'error', finishedAt: new Date().toISOString(), error: (err as Error).message?.slice(0, 500) })
      .catch(e => internalError('scan', e))
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
    releaseSlot()
    await locks.release(lockId)
  }
}

// Periodic job: refresh the DB once, then rescan every npm artefact.
export const rescanAll = async (): Promise<void> => {
  if (!config.scanning?.enabled) return
  try {
    await scanner.refreshDb()
  } catch (err) {
    internalError('scan-db-refresh', err)
  }
  const ids = await mongo.artefacts.find({ format: 'npm' }, { projection: { _id: 1 } }).toArray()
  for (const { _id } of ids) {
    await runScanNow(_id).catch(err => internalError('scan', err))
  }
}
