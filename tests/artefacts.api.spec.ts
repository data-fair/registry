import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, anonymousAx, axiosAuth, axiosWithApiKey, axiosInternal, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

let uploadApiKey: string

test.describe('Artefacts', () => {
  test.beforeEach(async () => {
    await clean()
    // Create an upload API key for tests
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
  })

  test.describe('Upload', () => {
    test('upload a tarball with valid API key', async () => {
      const tarball = await createTestTarball({
        name: '@test/processing-hello',
        version: '1.0.0',
        licence: 'MIT',
        category: 'processing'
      })

      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

      const res = await ax.post('/api/v1/artefacts/%40test%2Fprocessing-hello/versions', form, {
        headers: form.getHeaders()
      })
      expect(res.status).toBe(201)
      expect(res.data.artefact.name).toBe('@test/processing-hello')
      expect(res.data.artefact.category).toBe('processing')
      expect(res.data.version.version).toBe('1.0.0')
    })

    test('upload without API key returns 401', async () => {
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

      try {
        await anonymousAx.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, {
          headers: form.getHeaders()
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(401)
      }
    })

    test('upload with invalid API key returns 401', async () => {
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const ax = axiosWithApiKey('invalid-key')
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

      try {
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, {
          headers: form.getHeaders()
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(401)
      }
    })

    test('upload second version updates artefact', async () => {
      const ax = axiosWithApiKey(uploadApiKey)

      const tarball1 = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form1 = new FormData()
      form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form1, { headers: form1.getHeaders() })

      const tarball2 = await createTestTarball({ name: '@test/pkg', version: '1.1.0' })
      const form2 = new FormData()
      form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
      const res = await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form2, { headers: form2.getHeaders() })

      expect(res.data.artefact.version).toBe('1.1.0')
    })
  })

  test.describe('List & Detail', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // Upload a public artefact
      const tarball1 = await createTestTarball({ name: '@test/public-pkg', version: '1.0.0', category: 'processing' })
      const form1 = new FormData()
      form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpublic-pkg/versions', form1, { headers: form1.getHeaders() })
      await admin.patch('/api/v1/artefacts/%40test%2Fpublic-pkg%401', { public: true })

      // Upload a private artefact
      const tarball2 = await createTestTarball({ name: '@test/private-pkg', version: '2.0.0', category: 'catalog' })
      const form2 = new FormData()
      form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fprivate-pkg/versions', form2, { headers: form2.getHeaders() })
    })

    test('superadmin sees all artefacts', async () => {
      const ax = await superAdmin
      const res = await ax.get('/api/v1/artefacts')
      expect(res.data.count).toBe(2)
    })

    test('anonymous sees only public artefacts', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts')
      expect(res.data.count).toBe(1)
      expect(res.data.results[0].name).toBe('@test/public-pkg')
    })

    test('get artefact detail with versions', async () => {
      const ax = await superAdmin
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpublic-pkg%401')
      expect(res.data.name).toBe('@test/public-pkg')
      expect(res.data.versions).toHaveLength(1)
      expect(res.data.versions[0].version).toBe('1.0.0')
    })
  })

  test.describe('PATCH & DELETE', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
    })

    test('superadmin can PATCH editable metadata', async () => {
      const ax = await superAdmin
      const res = await ax.patch('/api/v1/artefacts/%40test%2Fpkg%401', {
        title: { fr: 'Mon paquet', en: 'My package' },
        description: { fr: 'Une description', en: 'A description' },
        public: true
      })
      expect(res.data.title.fr).toBe('Mon paquet')
      expect(res.data.public).toBe(true)
    })

    test('superadmin can DELETE artefact', async () => {
      const ax = await superAdmin
      const deleteRes = await ax.delete('/api/v1/artefacts/%40test%2Fpkg%401')
      expect(deleteRes.status).toBe(204)

      const listRes = await ax.get('/api/v1/artefacts')
      expect(listRes.data.count).toBe(0)
    })
  })

  test.describe('Version resolution', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      for (const v of ['1.0.0', '1.0.1', '1.1.0', '1.1.1', '2.0.0']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: v })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      }
      // Make public so we can access versions
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', { public: true })
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg%402', { public: true })
    })

    test('exact version match', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg%401/versions/1.0.1')
      expect(res.data.version).toBe('1.0.1')
    })

    test('minor-level resolution (latest patch)', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg%401/versions/1.1')
      expect(res.data.version).toBe('1.1.1')
    })

    test('major-level resolution (latest minor+patch)', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg%401/versions/1')
      expect(res.data.version).toBe('1.1.1')
    })
  })

  test.describe('Tarball download', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', {
        public: true,
        privateAccess: [{ type: 'organization', id: 'test1' }]
      })
    })

    test('download with internal secret', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpkg%401/versions/1.0.0/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('gzip')
    })

    test('download with session + grant', async () => {
      const admin = await superAdmin
      await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })

      const ax = await axiosAuth('test1-admin1', { org: 'test1' })
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpkg%401/versions/1.0.0/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
    })

    test('download without access returns 403', async () => {
      const ax = await axiosAuth('dev-standalone1')
      try {
        await ax.get('/api/v1/artefacts/%40test%2Fpkg%401/versions/1.0.0/tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })
  })
})
