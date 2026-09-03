import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'
import { ensureArtefact, localNodeDir } from '../lib-node/index.ts'

const registryUrl = `http://localhost:${process.env.DEV_API_PORT}`
const secretKey = 'secret-internal'
let uploadApiKey: string
let cacheDir: string

const uploadNpm = async (id: string, manifest: { name: string, version: string }) => {
  const ax = axiosWithApiKey(uploadApiKey)
  const tarball = await createTestTarball(manifest)
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  return ax.post('/api/v1/artefacts/npm/' + encodeURIComponent(id), form, { headers: form.getHeaders() })
}

test.describe('lib-node-registry', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
    cacheDir = join(tmpdir(), `registry-test-cache-${Date.now()}`)
    await mkdir(cacheDir, { recursive: true })
  })

  test.afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true })
  })

  test('downloads and extracts on first call (noarch)', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/pkg@1',
      cacheDir
    })
    expect(result.downloaded).toBe(true)
    expect(result.version).toBe('1.0.0')
    const pkg = JSON.parse(await readFile(join(result.path, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('@test/pkg')
  })

  test('returns cached result on second call', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', cacheDir }

    const r1 = await ensureArtefact(opts)
    expect(r1.downloaded).toBe(true)
    const r2 = await ensureArtefact(opts)
    expect(r2.downloaded).toBe(false)
    expect(r2.path).toBe(r1.path)
  })

  test('cache-hit call makes a single conditional request to the registry', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })

    // Counting proxy in front of the real registry. We measure only the SDK's
    // calls — the test's own admin requests go directly to the dev API.
    const apiHost = '127.0.0.1'
    const apiPort = Number(process.env.DEV_API_PORT)
    const requestPaths: string[] = []
    const proxy = http.createServer((req, res) => {
      requestPaths.push(`${req.method} ${req.url}`)
      const proxyReq = http.request({
        host: apiHost, port: apiPort, path: req.url, method: req.method, headers: req.headers
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode!, proxyRes.headers)
        proxyRes.pipe(res)
      })
      proxyReq.on('error', err => { res.statusCode = 502; res.end(String(err)) })
      req.pipe(proxyReq)
    })
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
    const proxyPort = (proxy.address() as AddressInfo).port

    try {
      const opts = {
        registryUrl: `http://127.0.0.1:${proxyPort}`,
        secretKey,
        artefactId: '@test/pkg@1',
        cacheDir
      }
      await ensureArtefact(opts) // warm cache
      requestPaths.length = 0
      const r = await ensureArtefact(opts)
      expect(r.downloaded).toBe(false)
      expect(requestPaths).toEqual([
        `GET /api/v1/artefacts/${encodeURIComponent('@test/pkg@1')}/download`
      ])
    } finally {
      await new Promise<void>(resolve => proxy.close(() => resolve()))
    }
  })

  test('cache slot lives under nodeMajor-libc when build:true', async () => {
    // Slot naming depends solely on opts.build; no native-module signal needed.
    await uploadNpm('@test/cache-key@1', { name: '@test/cache-key', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/cache-key@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/cache-key@1',
      cacheDir,
      build: true
    })
    // Path looks like <cacheDir>/<artefactId>/<major>-<libc>
    const segments = result.path.split('/').filter(Boolean)
    const slot = segments[segments.length - 1]
    expect(slot).toMatch(/^\d+-(glibc|musl)$/)
  })

  test('re-downloads when dataUpdatedAt changes', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', cacheDir }

    const r1 = await ensureArtefact(opts)
    expect(r1.version).toBe('1.0.0')

    // Wait >1s — Last-Modified is HTTP-date (second precision), so a same-second
    // republish would alias to the cached entry.
    await new Promise(resolve => setTimeout(resolve, 1100))
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.1' })

    const r2 = await ensureArtefact(opts)
    expect(r2.downloaded).toBe(true)
    expect(r2.version).toBe('1.0.1')
  })

  test('build:true runs postinstall when hasNativeModules is true', async () => {
    // Upload a tarball that has a node_modules subpackage with a
    // postinstall that writes a sentinel file. The detector flags
    // it as hasNativeModules; with build:true lib-node runs `npm rebuild`
    // which executes that postinstall.
    const subPkg = JSON.stringify({
      name: 'sentinel',
      version: '1.0.0',
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(__dirname + \'/SENTINEL\', \'ok\')"' }
    })
    const tarball = await createTestTarball({
      name: '@test/with-postinstall',
      version: '1.0.0',
      extraEntries: [
        // A .node binary trips the native-module detector without making npm
        // rebuild invoke node-gyp (which would happen if we used binding.gyp
        // and would fail for our fake fixture).
        { name: 'package/node_modules/sentinel/index.node', content: 'fake' },
        { name: 'package/node_modules/sentinel/package.json', content: subPkg }
      ]
    })
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/with-postinstall@1'), form, { headers: form.getHeaders() })

    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/with-postinstall@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/with-postinstall@1',
      cacheDir,
      build: true
    })
    expect(result.downloaded).toBe(true)
    const sentinel = join(result.path, 'node_modules', 'sentinel', 'SENTINEL')
    const fs = await import('node:fs/promises')
    await expect(fs.readFile(sentinel, 'utf-8')).resolves.toBe('ok')
  })

  test('build:true points node-gyp at the local Node headers', async () => {
    // node-gyp downloads headers unless npm_config_nodedir is set, which
    // breaks offline rebuilds. The postinstall records the env it ran with.
    const subPkg = JSON.stringify({
      name: 'nodedir-probe',
      version: '1.0.0',
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(__dirname + \'/NODEDIR\', process.env.npm_config_nodedir || \'\')"' }
    })
    const tarball = await createTestTarball({
      name: '@test/nodedir-probe',
      version: '1.0.0',
      extraEntries: [
        { name: 'package/node_modules/nodedir-probe/index.node', content: 'fake' },
        { name: 'package/node_modules/nodedir-probe/package.json', content: subPkg }
      ]
    })
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/nodedir-probe@1'), form, { headers: form.getHeaders() })

    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/nodedir-probe@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/nodedir-probe@1',
      cacheDir,
      build: true
    })
    const recorded = await readFile(join(result.path, 'node_modules', 'nodedir-probe', 'NODEDIR'), 'utf-8')
    // The dev/CI runtime ships headers (nvm, official docker images); the
    // recorded dir must be the one lib-node derived from process.execPath.
    expect(localNodeDir()).toBeTruthy()
    expect(recorded).toBe(localNodeDir())
  })

  test('build:false skips rebuild even when hasNativeModules is true', async () => {
    const subPkg = JSON.stringify({
      name: 'sentinel',
      version: '1.0.0',
      scripts: { postinstall: 'node -e "require(\'fs\').writeFileSync(__dirname + \'/SENTINEL\', \'ok\')"' }
    })
    const tarball = await createTestTarball({
      name: '@test/no-build',
      version: '1.0.0',
      extraEntries: [
        { name: 'package/node_modules/sentinel/index.node', content: 'fake' },
        { name: 'package/node_modules/sentinel/package.json', content: subPkg }
      ]
    })
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/no-build@1'), form, { headers: form.getHeaders() })

    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/no-build@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/no-build@1',
      cacheDir
      // build omitted -> false
    })
    const sentinel = join(result.path, 'node_modules', 'sentinel', 'SENTINEL')
    const fs = await import('node:fs/promises')
    await expect(fs.access(sentinel)).rejects.toBeTruthy()
  })
})
