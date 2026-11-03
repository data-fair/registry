import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdtemp, rm, mkdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import config from '#config'
import type { ScanFinding, ScanLicense } from '#mongo'
import { mapOsvOutput, summarize, detectInstallScripts, type Summary } from './operations.ts'

export type ScanResult = {
  vulnerabilities: ScanFinding[]
  licenses: ScanLicense[]
  summary: Summary
  hasInstallScripts: boolean
  scannerVersion: string
  // mtime of the local OSV DB the scan ran against, so admins can gauge
  // result freshness. Undefined if the DB file can't be stat'd.
  vulnDbUpdatedAt?: string
}

export interface Scanner {
  // Scan an already-extracted artefact directory.
  scanDir (dir: string): Promise<ScanResult>
  // Refresh the local offline DB (online). Folded into the periodic job.
  refreshDb (): Promise<void>
  version (): Promise<string>
}

const run = (args: string[], timeoutMs: number): Promise<{ code: number, stdout: string, stderr: string }> =>
  new Promise((resolve, reject) => {
    const scannerPath = config.scanning?.osvScannerPath ?? 'osv-scanner'
    const child: ChildProcess = spawn(scannerPath, args, { timeout: timeoutMs })
    let stdout = ''
    let stderr = ''
    child.stdout!.on('data', (d: Buffer) => { stdout += d })
    child.stderr!.on('data', (d: Buffer) => { stderr += d })
    child.on('error', reject)
    child.on('close', (code: number | null, signal: string | null) => {
      // A timeout kills the child with a signal; treat that as a failure rather
      // than silently resolving with empty stdout (which would look "clean").
      if (signal) { reject(new Error(`osv-scanner terminated by signal ${signal} (timeout?)`)); return }
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })

// osv-scanner exits 0 = no vulns, 1 = vulns found, >1 = real error
// (e.g. 128 = "no package sources found"). Flags pinned by the Task 1 spike
// against osv-scanner v2.2.3, output re-checked identical on v2.7.0.
const EXIT_VULNS_FOUND = 1

// The scalibr package.json extractor is NOT enabled by default; without it a
// directory scan of bundled (lockfile-less) node_modules finds nothing.
// v2.7 deprecates this flag for --x-plugins, which v2.2 does not know: keep the
// old spelling while dev machines may still run v2.2.
const PLUGIN_ARGS = ['--experimental-plugins', 'javascript/packagejson']

// Sub-directory of --local-db-path the offline DB lands in: "osv-scalibr" since
// v2.7, "osv-scanner" before. Current first.
const DB_LAYOUTS = ['osv-scalibr', 'osv-scanner']

class OsvScanner implements Scanner {
  // The binary doesn't change at runtime, so resolve the version once.
  private versionCache?: string

  async version (): Promise<string> {
    if (this.versionCache) return this.versionCache
    const { stdout } = await run(['--version'], 30_000)
    // First line: "osv-scanner version: X.Y.Z"
    this.versionCache = stdout.trim().split('\n')[0] || 'unknown'
    return this.versionCache
  }

  // Best-effort freshness timestamp of the local OSV DB (npm/all.zip mtime).
  private async dbUpdatedAt (): Promise<string | undefined> {
    const dbDir = config.scanning?.dbDir ?? 'osv-db'
    for (const layout of DB_LAYOUTS) {
      try {
        const { mtime } = await stat(join(dbDir, layout, 'npm', 'all.zip'))
        return mtime.toISOString()
      } catch { /* try the next layout */ }
    }
    return undefined
  }

  async refreshDb (): Promise<void> {
    // The DB is only downloaded when >=1 package is found, so scan a tiny dummy
    // dir holding one package.json (with --allow-no-lockfiles).
    const dbDir = config.scanning?.dbDir ?? 'osv-db'
    const timeoutMs = (config.scanning?.timeoutSeconds ?? 300) * 1000
    await mkdir(dbDir, { recursive: true })
    const dummy = await mkdtemp(join(tmpdir(), 'osv-db-refresh-'))
    try {
      await mkdir(join(dummy, 'node_modules', 'left-pad'), { recursive: true })
      await writeFile(join(dummy, 'node_modules', 'left-pad', 'package.json'), '{"name":"left-pad","version":"1.0.0"}')
      const args = [
        'scan', 'source', '--recursive',
        // Scan extracted artefacts regardless of any .gitignore: the cache dir
        // may live under a git-ignored path (e.g. dev's ./data), and a tarball
        // could even bundle its own .gitignore. Both would otherwise hide files.
        '--no-ignore',
        ...PLUGIN_ARGS,
        '--offline-vulnerabilities',
        '--download-offline-databases',
        '--local-db-path', dbDir,
        '--allow-no-lockfiles',
        '--format', 'json',
        dummy
      ]
      const { code, stderr } = await run(args, timeoutMs)
      if (code > EXIT_VULNS_FOUND) throw new Error(`osv-scanner db refresh failed (exit ${code}): ${stderr.slice(0, 500)}`)
      // Once the current layout is in place, the legacy one is a stale ~200 MB copy.
      const [current, ...legacy] = DB_LAYOUTS
      if (await stat(join(dbDir, current, 'npm', 'all.zip')).then(() => true, () => false)) {
        for (const layout of legacy) await rm(join(dbDir, layout), { recursive: true, force: true }).catch(() => {})
      }
    } finally {
      await rm(dummy, { recursive: true, force: true }).catch(() => {})
    }
  }

  async scanDir (dir: string): Promise<ScanResult> {
    const dbDir = config.scanning?.dbDir ?? 'osv-db'
    const timeoutMs = (config.scanning?.timeoutSeconds ?? 300) * 1000
    const args = [
      'scan', 'source', '--recursive',
      // Scan extracted artefacts regardless of any .gitignore: the cache dir
      // lives under a git-ignored path (dev's ./data) and a tarball could even
      // bundle its own .gitignore — both would otherwise hide all files.
      '--no-ignore',
      ...PLUGIN_ARGS,
      '--offline-vulnerabilities',
      '--local-db-path', dbDir,
      '--allow-no-lockfiles',
      '--format', 'json',
      dir
    ]
    const { code, stdout, stderr } = await run(args, timeoutMs)
    if (code > EXIT_VULNS_FOUND) {
      throw new Error(`osv-scanner failed (exit ${code}): ${stderr.slice(0, 500)}`)
    }
    const raw = stdout.trim() ? JSON.parse(stdout) : { results: [] }
    const { vulnerabilities, licenses, summary } = mapOsvOutput(raw)

    let hasInstallScripts = false
    try {
      const topPkg = JSON.parse(await readFile(join(dir, 'package', 'package.json'), 'utf-8'))
      hasInstallScripts = detectInstallScripts(topPkg)
    } catch { /* top-level package.json missing/unreadable — leave false */ }

    return {
      vulnerabilities,
      licenses,
      summary,
      hasInstallScripts,
      scannerVersion: await this.version(),
      vulnDbUpdatedAt: await this.dbUpdatedAt()
    }
  }
}

export { summarize }
export const osvScanner: Scanner = new OsvScanner()
