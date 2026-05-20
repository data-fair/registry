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

const uploadNpm = async (id: string, manifest: { name: string, version: string }, architecture?: string) => {
  const ax = axiosWithApiKey(uploadApiKey)
  const tarball = await createTestTarball(manifest)
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  if (architecture) form.append('architecture', architecture)
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
      cacheDir,
      architecture: ''  // opt out, use noarch directly
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
    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', cacheDir, architecture: '' as const }

    const r1 = await ensureArtefact(opts)
    expect(r1.downloaded).toBe(true)
    const r2 = await ensureArtefact(opts)
    expect(r2.downloaded).toBe(false)
    expect(r2.path).toBe(r1.path)
  })

  test('re-downloads when dataUpdatedAt changes', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' })
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    const opts = { registryUrl, secretKey, artefactId: '@test/pkg@1', cacheDir, architecture: '' as const }

    const r1 = await ensureArtefact(opts)
    expect(r1.version).toBe('1.0.0')

    await new Promise(resolve => setTimeout(resolve, 10))
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.1' })

    const r2 = await ensureArtefact(opts)
    expect(r2.downloaded).toBe(true)
    expect(r2.version).toBe('1.0.1')
  })

  test('serves arch-specific slot when requested', async () => {
    await uploadNpm('@test/pkg@1', { name: '@test/pkg', version: '1.0.0' }, 'x64')
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })

    const result = await ensureArtefact({
      registryUrl,
      secretKey,
      artefactId: '@test/pkg@1',
      cacheDir,
      architecture: 'x64'
    })
    expect(result.downloaded).toBe(true)
  })
})
