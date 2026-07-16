import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { readFile, rm, mkdir, readdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { createTestTarball } from './support/test-tarball.ts'
import { ensureArtefact } from '../lib-node/index.ts'

// A self-contained fake registry exposing only GET /:id/download, mirroring the
// real endpoint's headers and conditional-GET semantics. Tests mutate `state`
// between calls to simulate (re-)uploads without needing the full dev stack.
interface FakeState {
  tarball: Buffer
  version: string
  lastModified: Date
  hasNativeModules: boolean
}

const startFakeRegistry = async (state: FakeState) => {
  const server = http.createServer((req, res) => {
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
    res.end(state.tarball)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve()))
  }
}

test.describe('lib-node version-keyed extraction', () => {
  let cacheDir: string
  const artefactId = '@test/pkg@1'
  const secretKey = 'secret-internal'

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
