import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'
import { ensureArtefact } from '../lib-node/index.ts'

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

  test('cache slot lives under nodeMajor-libc when build:true', async () => {
    const subPkg = JSON.stringify({ name: 'sentinel', version: '1.0.0', scripts: {} })
    const tarball = await createTestTarball({
      name: '@test/cache-key',
      version: '1.0.0',
      extraEntries: [
        { name: 'package/node_modules/sentinel/binding.gyp', content: '{}' },
        { name: 'package/node_modules/sentinel/package.json', content: subPkg }
      ]
    })
    const ax = axiosWithApiKey(uploadApiKey)
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/cache-key@1'), form, { headers: form.getHeaders() })
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

    await new Promise(resolve => setTimeout(resolve, 10))
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
        { name: 'package/node_modules/sentinel/binding.gyp', content: '{}' },
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
        { name: 'package/node_modules/sentinel/binding.gyp', content: '{}' },
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
