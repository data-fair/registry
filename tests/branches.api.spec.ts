import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, anonymousAx, axiosAuth, axiosWithApiKey, axiosInternal, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

let uploadApiKey: string

const uploadBranch = async (key: string, name: string, opts: { version?: string, category?: string, branchName?: string, architecture?: string, manifestName?: string } = {}) => {
  // Manifest name and URL name are independent for branch artefacts. Default
  // to making them differ to assert that's allowed.
  const tarball = await createTestTarball({
    name: opts.manifestName ?? name,
    version: opts.version ?? '0.1.0',
    licence: 'MIT',
    category: opts.category ?? 'processing'
  })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  if (opts.branchName) form.append('branchName', opts.branchName)
  if (opts.architecture) form.append('architecture', opts.architecture)
  if (opts.category) form.append('category', opts.category)
  return axiosWithApiKey(key).post(
    `/api/v1/artefacts/branch/${encodeURIComponent(name)}`,
    form,
    { headers: form.getHeaders() }
  )
}

test.describe('Branch artefacts', () => {
  test.beforeEach(async () => {
    await clean()
    const admin = await superAdmin
    const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
  })

  test.describe('Upload', () => {
    test('upload happy path creates a branch artefact', async () => {
      const res = await uploadBranch(uploadApiKey, '@test/pkg-main', { version: '0.2.0', branchName: 'main', architecture: 'x64' })
      expect(res.status).toBe(201)
      expect(res.data.artefact.format).toBe('branch')
      expect(res.data.artefact._id).toBe('@test/pkg-main')
      expect(res.data.artefact.branchName).toBe('main')
      expect(res.data.artefact.architecture).toBe('x64')
      expect(res.data.artefact.version).toBe('0.2.0')
      expect(res.data.artefact.licence).toBe('MIT')
      expect(typeof res.data.artefact.size).toBe('number')
      expect(res.data.artefact.uploadedBy.apiKeyName).toBe('test-upload')
    })

    test('packageName comes from the manifest, _id from the URL — they can differ', async () => {
      const res = await uploadBranch(uploadApiKey, '@data-fair/processing-gpkg-main', {
        manifestName: '@data-fair/processing-gpkg',
        version: '0.5.0',
        branchName: 'main'
      })
      expect(res.data.artefact._id).toBe('@data-fair/processing-gpkg-main')
      expect(res.data.artefact.packageName).toBe('@data-fair/processing-gpkg')
    })

    test('second upload overwrites the tarball and bumps dataUpdatedAt', async () => {
      const first = await uploadBranch(uploadApiKey, '@test/pkg-main', { version: '0.1.0' })
      const firstPath = first.data.artefact.filePath
      const firstDataAt = first.data.artefact.dataUpdatedAt
      // Force a different timestamp value
      await new Promise(resolve => setTimeout(resolve, 10))
      const second = await uploadBranch(uploadApiKey, '@test/pkg-main', { version: '0.1.1' })
      expect(second.data.artefact.filePath).not.toBe(firstPath)
      expect(second.data.artefact.version).toBe('0.1.1')
      expect(second.data.artefact.dataUpdatedAt).not.toBe(firstDataAt)
    })

    test('second upload can drop the architecture tag', async () => {
      const first = await uploadBranch(uploadApiKey, '@test/pkg-main', { architecture: 'x64' })
      expect(first.data.artefact.architecture).toBe('x64')
      const second = await uploadBranch(uploadApiKey, '@test/pkg-main', { /* no arch */ })
      expect(second.data.artefact.architecture).toBeUndefined()
    })

    test('upload without API key returns 401', async () => {
      const tarball = await createTestTarball({ name: '@test/pkg', version: '0.1.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      try {
        await anonymousAx.post('/api/v1/artefacts/branch/%40test%2Fpkg-main', form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(401)
      }
    })

    test('read API key cannot upload branch artefacts', async () => {
      const admin = await superAdmin
      await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
      const test1 = await axiosAuth('test1-admin1', { org: 'test1' })
      const keyRes = await test1.post('/api/v1/api-keys', {
        type: 'read',
        name: 'reader',
        owner: { type: 'organization', id: 'test1' }
      })
      const readKey = keyRes.data.key
      try {
        await uploadBranch(readKey, '@test/pkg-main')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('scoped allowedName accepts matching name', async () => {
      const admin = await superAdmin
      const keyRes = await admin.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'scoped',
        allowedName: '@scoped/plugin-main'
      })
      const res = await uploadBranch(keyRes.data.key, '@scoped/plugin-main')
      expect(res.status).toBe(201)
    })

    test('scoped allowedName rejects non-matching name', async () => {
      const admin = await superAdmin
      const keyRes = await admin.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'scoped',
        allowedName: '@scoped/plugin-main'
      })
      try {
        await uploadBranch(keyRes.data.key, '@other/plugin-main')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('scoped allowedCategory rejects mismatched category', async () => {
      const admin = await superAdmin
      const keyRes = await admin.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'cat-scoped',
        allowedCategory: 'processing'
      })
      try {
        await uploadBranch(keyRes.data.key, '@test/pkg-main', { category: 'catalog' })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('internal secret can upload a branch artefact', async () => {
      const ax = axiosInternal('secret-internal')
      const tarball = await createTestTarball({ name: '@test/pkg', version: '0.1.0', category: 'processing' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      form.append('branchName', 'main')
      const res = await ax.post('/api/v1/artefacts/branch/%40test%2Fpkg-main', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
      expect(res.data.artefact.format).toBe('branch')
      expect(res.data.artefact.uploadedBy.internal).toBe(true)
    })

    test('conflict with existing npm artefact returns 409', async () => {
      // Upload an npm artefact first
      const t = await createTestTarball({ name: '@test/pkg', version: '1.0.0', category: 'processing' })
      const form = new FormData()
      form.append('file', t, { filename: 'package.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })

      // Now try to upload a branch artefact at the same _id
      try {
        await uploadBranch(uploadApiKey, '@test/pkg')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })
  })

  test.describe('Read endpoints', () => {
    test('detail returns the branch artefact without a versions array', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      const res = await admin.get('/api/v1/artefacts/%40test%2Fpkg-main')
      expect(res.data.format).toBe('branch')
      expect(res.data.versions).toBeUndefined()
    })

    test('GET /versions/:selector on a branch artefact returns 404', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      try {
        await admin.get('/api/v1/artefacts/%40test%2Fpkg-main/versions/0.1.0')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('GET /versions/:selector/tarball on a branch artefact returns 404', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      try {
        await admin.get('/api/v1/artefacts/%40test%2Fpkg-main/versions/0.1.0/tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('admin can download branch tarball', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      const res = await admin.get('/api/v1/artefacts/%40test%2Fpkg-main/branch/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('gzip')
    })

    test('internal secret can download branch tarball', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg-main', { public: true })
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpkg-main/branch/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
    })

    test('anonymous cannot download branch tarball even if public', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg-main', { public: true })
      try {
        await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg-main/branch/tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('GET /branch/tarball on a non-branch artefact returns 400', async () => {
      const t = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', t, { filename: 'package.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      const admin = await superAdmin
      try {
        await admin.get('/api/v1/artefacts/%40test%2Fpkg/branch/tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(400)
      }
    })
  })

  test.describe('Delete', () => {
    test('superadmin can delete a branch artefact', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      const del = await admin.delete('/api/v1/artefacts/%40test%2Fpkg-main')
      expect(del.status).toBe(204)
      try {
        await admin.get('/api/v1/artefacts/%40test%2Fpkg-main')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })
  })

  test.describe('Federation filter (read API keys)', () => {
    test('read API key cannot list branch artefacts', async () => {
      // Public branch artefact
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg-main', { public: true })

      // Public npm artefact (control: should still be visible)
      const t = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', t, { filename: 'package.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', { public: true })

      // Read key
      await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
      const test1 = await axiosAuth('test1-admin1', { org: 'test1' })
      const keyRes = await test1.post('/api/v1/api-keys', {
        type: 'read',
        name: 'federation',
        owner: { type: 'organization', id: 'test1' }
      })

      const ax = axiosWithApiKey(keyRes.data.key)
      const list = await ax.get('/api/v1/artefacts')
      const names = list.data.results.map((a: any) => a.name)
      expect(names).toContain('@test/pkg')
      expect(names).not.toContain('@test/pkg-main')
    })

    test('read API key cannot fetch branch artefact detail', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg-main', { public: true })

      await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
      const test1 = await axiosAuth('test1-admin1', { org: 'test1' })
      const keyRes = await test1.post('/api/v1/api-keys', {
        type: 'read',
        name: 'federation',
        owner: { type: 'organization', id: 'test1' }
      })

      try {
        await axiosWithApiKey(keyRes.data.key).get('/api/v1/artefacts/%40test%2Fpkg-main')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('anonymous (non-federation) can list public branch artefacts', async () => {
      await uploadBranch(uploadApiKey, '@test/pkg-main')
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg-main', { public: true })

      const res = await anonymousAx.get('/api/v1/artefacts')
      const names = res.data.results.map((a: any) => a.name)
      expect(names).toContain('@test/pkg-main')
    })
  })
})
