import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { readFile, writeFile, rm, mkdir, readdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { createTestTarball } from './support/test-tarball.ts'
import { ensureArtefact, ensureArtefactFile } from '../lib-node/index.ts'

// A self-contained fake registry exposing only GET /:id/download, mirroring the
// real endpoint's headers and conditional-GET semantics. Tests mutate `state`
// between calls to simulate (re-)uploads without needing the full dev stack.
interface FakeState {
  tarball: Buffer
  version: string
  lastModified: Date
  hasNativeModules: boolean
}

// `hold` lets a test stall the nth download halfway through its body until the
// returned promise resolves, to interleave concurrent calls deterministically.
const startFakeRegistry = async (state: FakeState, hold?: (req: http.IncomingMessage, requestNumber: number) => Promise<void> | undefined) => {
  let requests = 0
  const server = http.createServer((req, res) => {
    const requestNumber = ++requests
    if (!req.url?.includes('/download')) {
      res.statusCode = 404
      res.end()
      return
    }
    res.setHeader('Last-Modified', state.lastModified.toUTCString())
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Artefact-Version', state.version)
    res.setHeader('X-Artefact-Has-Native-Modules', state.hasNativeModules ? 'true' : 'false')

    const ims = req.headers['if-modified-since']
    if (ims) {
      const since = Math.floor(new Date(ims).getTime() / 1000)
      const mod = Math.floor(state.lastModified.getTime() / 1000)
      if (!isNaN(since) && since >= mod) {
        res.statusCode = 304
        res.end()
        return
      }
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/gzip')
    const held = hold?.(req, requestNumber)
    if (!held) {
      res.end(state.tarball)
      return
    }
    const tarball = state.tarball
    const half = Math.floor(tarball.length / 2)
    res.write(tarball.subarray(0, half))
    held.then(() => res.end(tarball.subarray(half)))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    get requests () { return requests },
    close: () => new Promise<void>(resolve => server.close(() => resolve()))
  }
}

test.describe('lib-node version-keyed extraction', () => {
  let cacheDir: string
  const artefactId = '@test/pkg@1'
  const secretKey = 'secret-registry-internal'

  test.beforeEach(async () => {
    cacheDir = join(tmpdir(), `registry-cache-unit-${process.pid}-${Math.floor(performance.now())}`)
    await mkdir(cacheDir, { recursive: true })
  })

  test.afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  test('extraction path changes when artefact content changes', async () => {
    const state: FakeState = {
      tarball: await createTestTarball({ name: '@test/pkg', version: '1.0.0' }),
      version: '1.0.0',
      lastModified: new Date('2026-01-01T00:00:00Z'),
      hasNativeModules: false
    }
    const registry = await startFakeRegistry(state)
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      const r1 = await ensureArtefact(opts)
      expect(r1.downloaded).toBe(true)

      // Simulate a re-upload: new content + newer Last-Modified.
      state.tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.1' })
      state.version = '1.0.1'
      state.lastModified = new Date('2026-01-02T00:00:00Z')

      const r2 = await ensureArtefact(opts)
      expect(r2.downloaded).toBe(true)
      expect(r2.version).toBe('1.0.1')
      // The core fix: a content change yields a brand-new extraction path so
      // Node's ESM module registry (keyed by resolved URL) reloads the graph.
      expect(r2.path).not.toBe(r1.path)
    } finally {
      await registry.close()
    }
  })

  test('same-version re-publish (dataUpdatedAt moves) also changes the path', async () => {
    const state: FakeState = {
      tarball: await createTestTarball({ name: '@test/pkg', version: '1.0.0' }),
      version: '1.0.0',
      lastModified: new Date('2026-01-01T00:00:00Z'),
      hasNativeModules: false
    }
    const registry = await startFakeRegistry(state)
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      const r1 = await ensureArtefact(opts)

      // Same version string, but a fresh upload bumps dataUpdatedAt.
      state.lastModified = new Date('2026-01-01T00:00:05Z')
      const r2 = await ensureArtefact(opts)
      expect(r2.downloaded).toBe(true)
      expect(r2.version).toBe('1.0.0')
      expect(r2.path).not.toBe(r1.path)
    } finally {
      await registry.close()
    }
  })

  test('returns the same extraction path on an unchanged (304) call', async () => {
    const state: FakeState = {
      tarball: await createTestTarball({ name: '@test/pkg', version: '1.0.0' }),
      version: '1.0.0',
      lastModified: new Date('2026-01-01T00:00:00Z'),
      hasNativeModules: false
    }
    const registry = await startFakeRegistry(state)
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      const r1 = await ensureArtefact(opts)
      expect(r1.downloaded).toBe(true)
      const r2 = await ensureArtefact(opts)
      expect(r2.downloaded).toBe(false)
      expect(r2.path).toBe(r1.path)
      // Content is still readable from the cached path.
      const pkg = JSON.parse(await readFile(join(r2.path, 'package.json'), 'utf-8'))
      expect(pkg.name).toBe('@test/pkg')
    } finally {
      await registry.close()
    }
  })

  test('writes a stable per-buildTuple pointer file', async () => {
    const state: FakeState = {
      tarball: await createTestTarball({ name: '@test/pkg', version: '1.0.0' }),
      version: '1.0.0',
      lastModified: new Date('2026-01-01T00:00:00Z'),
      hasNativeModules: false
    }
    const registry = await startFakeRegistry(state)
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      const r1 = await ensureArtefact(opts)

      const artefactDir = join(cacheDir, artefactId)
      const pointer = JSON.parse(await readFile(join(artefactDir, '.pointer-js.json'), 'utf-8'))
      expect(pointer.dataUpdatedAt).toBe(r1.dataUpdatedAt)
      expect(pointer.version).toBe('1.0.0')
      // The pointer's dir resolves to the returned extraction path.
      expect(join(artefactDir, pointer.dir)).toBe(r1.path)
    } finally {
      await registry.close()
    }
  })

  test('prunes the previous version directory after a re-download', async () => {
    const state: FakeState = {
      tarball: await createTestTarball({ name: '@test/pkg', version: '1.0.0' }),
      version: '1.0.0',
      lastModified: new Date('2026-01-01T00:00:00Z'),
      hasNativeModules: false
    }
    const registry = await startFakeRegistry(state)
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      const r1 = await ensureArtefact(opts)

      state.tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.1' })
      state.version = '1.0.1'
      state.lastModified = new Date('2026-01-02T00:00:00Z')
      const r2 = await ensureArtefact(opts)

      // The old extraction directory is gone; only the current one remains.
      await expect(access(r1.path)).rejects.toBeTruthy()
      await expect(access(r2.path)).resolves.toBeUndefined()

      // No stray versioned dirs accumulate (just the pointer file + one dir).
      const artefactDir = join(cacheDir, artefactId)
      const entries = (await readdir(artefactDir)).filter(e => !e.startsWith('.'))
      expect(entries).toHaveLength(1)
    } finally {
      await registry.close()
    }
  })

  test('pruning keeps a version dir still referenced by another buildTuple', async () => {
    const state: FakeState = {
      tarball: await createTestTarball({ name: '@test/pkg', version: '1.0.0' }),
      version: '1.0.0',
      lastModified: new Date('2026-01-01T00:00:00Z'),
      hasNativeModules: false
    }
    const registry = await startFakeRegistry(state)
    try {
      const base = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      // The "js" (build:false) consumer warms its slot against the v1 content.
      const jsResult = await ensureArtefact(base)

      // Content changes, then a build:true consumer downloads the new version.
      // Its prune pass must not delete the js slot's still-current version dir.
      state.tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.1' })
      state.version = '1.0.1'
      state.lastModified = new Date('2026-01-02T00:00:00Z')
      await ensureArtefact({ ...base, build: true })

      await expect(access(jsResult.path)).resolves.toBeUndefined()
    } finally {
      await registry.close()
    }
  })
})

// Many small files over a few dirs: a wide window for concurrent calls to interleave.
const manyFiles = (n: number) => Array.from({ length: n }, (_, i) => ({
  name: `package/lib/d${i % 20}/f${i}.d.ts.map`,
  content: 'x'.repeat(200)
}))

// files of the tarball, without the dotfiles the tests add
const countFiles = async (dir: string) =>
  (await readdir(dir, { withFileTypes: true, recursive: true })).filter(e => e.isFile() && !e.name.startsWith('.')).length

const tmpLeftovers = async (dir: string) =>
  (await readdir(dir, { recursive: true })).filter(e => e.includes('.tmp.'))

test.describe('lib-node concurrent and failing extractions', () => {
  let cacheDir: string
  const artefactId = '@test/pkg@1'
  const secretKey = 'secret-registry-internal'
  const lastModified = new Date('2026-01-01T00:00:00Z')

  const stateWith = async (extraEntries: { name: string, content: string }[]): Promise<FakeState> => ({
    tarball: await createTestTarball({ name: '@test/pkg', version: '1.0.0', extraEntries }),
    version: '1.0.0',
    lastModified,
    hasNativeModules: false
  })

  test.beforeEach(async () => {
    cacheDir = join(tmpdir(), `registry-cache-unit-${process.pid}-${Math.floor(performance.now())}`)
    await mkdir(cacheDir, { recursive: true })
  })

  test.afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  test('concurrent identical calls on a cold cache share one download', async () => {
    const registry = await startFakeRegistry(await stateWith(manyFiles(200)))
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      const results = await Promise.all([1, 2, 3, 4].map(() => ensureArtefact(opts)))
      expect(registry.requests).toBe(1)
      for (const r of results) expect(r.path).toBe(results[0].path)
      expect(await countFiles(results[0].path)).toBe(201)
    } finally {
      await registry.close()
    }
  })

  test('concurrent downloads of the same version keep one complete extraction', async () => {
    // Calls for different accounts are not shared (each one checks its own access): both download.
    // org2's download stalls halfway until org1's call has returned its path.
    let releaseOrg2: () => void = () => {}
    const org2Released = new Promise<void>(resolve => { releaseOrg2 = resolve })
    const registry = await startFakeRegistry(await stateWith(manyFiles(200)),
      req => String(req.headers['x-account']).includes('org2') ? org2Released : undefined)
    try {
      const base = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      const p1 = ensureArtefact({ ...base, account: { type: 'organization', id: 'org1' } })
      const p2 = ensureArtefact({ ...base, account: { type: 'organization', id: 'org2' } })
      const r1 = await p1
      // stands for org1's caller loading the plugin from its path
      await writeFile(join(r1.path, '.in-use'), '')
      releaseOrg2()
      const r2 = await p2
      expect(registry.requests).toBe(2)
      expect(r2.path).toBe(r1.path)
      // the late call must neither replace the dir in use nor install a partial copy over it
      await expect(access(join(r1.path, '.in-use'))).resolves.toBeUndefined()
      expect(await countFiles(r1.path)).toBe(201)
      expect(JSON.parse(await readFile(join(r1.path, 'package.json'), 'utf-8')).name).toBe('@test/pkg')
      expect(await tmpLeftovers(join(cacheDir, artefactId))).toEqual([])
    } finally {
      await registry.close()
    }
  })

  test('a failed file write rejects the call instead of crashing the process', async () => {
    // "a" cannot be both a file and a directory: one of the two writes fails while
    // the following entries are still streaming
    const registry = await startFakeRegistry(await stateWith([
      { name: 'package/a', content: 'x' },
      { name: 'package/a/b', content: 'y' },
      ...manyFiles(2000)
    ]))
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      await expect(ensureArtefact(opts)).rejects.toThrow(/EEXIST|ENOTDIR|EISDIR/)
      await expect(access(join(cacheDir, artefactId, '.pointer-js.json'))).rejects.toBeTruthy()
    } finally {
      await registry.close()
    }
  })

  test('a tarball entry escaping the destination rejects the call instead of crashing the process', async () => {
    const registry = await startFakeRegistry(await stateWith([{ name: '../evil.txt', content: 'x' }]))
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir }
      await expect(ensureArtefact(opts)).rejects.toThrow('invalid path in tarball: ../evil.txt')
      expect((await readdir(cacheDir, { recursive: true })).filter(e => e.endsWith('evil.txt'))).toEqual([])
    } finally {
      await registry.close()
    }
  })

  test('concurrent ensureArtefactFile calls both end with the complete file', async () => {
    const state = await stateWith(manyFiles(200))
    // the second download stalls halfway until one of the two calls has returned
    let release: () => void = () => {}
    const released = new Promise<void>(resolve => { release = resolve })
    const registry = await startFakeRegistry(state, (_req, n) => n === 2 ? released : undefined)
    try {
      const opts = { registryUrl: registry.url, secretKey, artefactId, cacheDir, fileName: 'artefact.tgz' }
      const p1 = ensureArtefactFile(opts)
      const p2 = ensureArtefactFile(opts)
      Promise.race([p1, p2]).then(release, release)
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r2.path).toBe(r1.path)
      expect((await readFile(r1.path)).equals(state.tarball)).toBe(true)
      expect(await tmpLeftovers(cacheDir)).toEqual([])
    } finally {
      await registry.close()
    }
  })
})
