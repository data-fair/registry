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

  test('downloads and extracts artefact on first call', async () => {
    const ax = axiosWithApiKey(uploadApiKey)
    const admin = await superAdmin

    const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0', category: 'processing' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
    await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/pkg@1',
      version: '1',
      cacheDir
    })

    expect(result.downloaded).toBe(true)
    expect(result.version).toBe('1.0.0')

    const pkg = JSON.parse(await readFile(join(result.path, 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('@test/pkg')
    expect(pkg.version).toBe('1.0.0')
  })

  test('returns cached result on second call', async () => {
    const ax = axiosWithApiKey(uploadApiKey)
    const admin = await superAdmin

    const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
    await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', { public: true })

    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', version: '1', cacheDir }

    const result1 = await ensureArtefact(opts)
    expect(result1.downloaded).toBe(true)

    const result2 = await ensureArtefact(opts)
    expect(result2.downloaded).toBe(false)
    expect(result2.version).toBe('1.0.0')
    expect(result2.path).toBe(result1.path)
  })

  test('downloads new version and cleans old one', async () => {
    const ax = axiosWithApiKey(uploadApiKey)
    const admin = await superAdmin

    const tarball1 = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
    const form1 = new FormData()
    form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form1, { headers: form1.getHeaders() })
    await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', { public: true })

    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', version: '1', cacheDir }

    const result1 = await ensureArtefact(opts)
    expect(result1.version).toBe('1.0.0')

    // Upload new version
    const tarball2 = await createTestTarball({ name: '@test/pkg', version: '1.1.0' })
    const form2 = new FormData()
    form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
    await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form2, { headers: form2.getHeaders() })

    const result2 = await ensureArtefact(opts)
    expect(result2.downloaded).toBe(true)
    expect(result2.version).toBe('1.1.0')

    const pkg = JSON.parse(await readFile(join(result2.path, 'package.json'), 'utf-8'))
    expect(pkg.version).toBe('1.1.0')

    // Old version directory should be cleaned up
    const { access } = await import('node:fs/promises')
    try {
      await access(result1.path)
      expect(true).toBe(false) // should not reach here
    } catch (err: any) {
      expect(err.code).toBe('ENOENT')
    }
  })
})
