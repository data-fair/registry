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

    test('scoped upload key accepts matching name', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'scoped',
        allowedNames: ['@koumoul/*', 'terrain-france']
      })
      const scopedKey = keyRes.data.key
      expect(keyRes.data.allowedNames).toEqual(['@koumoul/*', 'terrain-france'])

      const upload = axiosWithApiKey(scopedKey)

      // Prefix match
      const tarball1 = await createTestTarball({ name: '@koumoul/processing-x', version: '1.0.0' })
      const form1 = new FormData()
      form1.append('file', tarball1, { filename: 'p.tgz', contentType: 'application/gzip' })
      const res1 = await upload.post('/api/v1/artefacts/%40koumoul%2Fprocessing-x/versions', form1, { headers: form1.getHeaders() })
      expect(res1.status).toBe(201)

      // Exact match for a file artefact
      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      const res2 = await upload.post('/api/v1/artefacts/file/terrain-france', fileForm, { headers: fileForm.getHeaders() })
      expect(res2.status).toBe(201)
    })

    test('scoped upload key rejects non-matching name', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'scoped',
        allowedNames: ['terrain-*']
      })
      const scopedKey = keyRes.data.key
      const upload = axiosWithApiKey(scopedKey)

      // Reject npm upload outside the scope
      const tarball = await createTestTarball({ name: '@evil/payload', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      try {
        await upload.post('/api/v1/artefacts/%40evil%2Fpayload/versions', form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }

      // Reject file upload outside the scope
      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'basemap.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      try {
        await upload.post('/api/v1/artefacts/file/basemap-world', fileForm, { headers: fileForm.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('unscoped upload key still accepts any name', async () => {
      // The default key created in beforeEach has no allowedNames — it should
      // behave as unrestricted (backwards compatible).
      const upload = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@anywhere/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      const res = await upload.post('/api/v1/artefacts/%40anywhere%2Fpkg/versions', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
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

  test.describe('2-deep retention', () => {
    test('keeps only 2 most recent patches per minor branch', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // Upload 3 patch versions for minor 1.0
      for (const v of ['1.0.0', '1.0.1', '1.0.2']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: v })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      }

      await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', { public: true })

      // Should have kept only 1.0.1 and 1.0.2
      const detail = await admin.get('/api/v1/artefacts/%40test%2Fpkg%401')
      const versions = detail.data.versions.map((v: any) => v.version)
      expect(versions).toContain('1.0.2')
      expect(versions).toContain('1.0.1')
      expect(versions).not.toContain('1.0.0')
      expect(detail.data.versions).toHaveLength(2)
    })

    test('does not prune across different minor branches', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      for (const v of ['1.0.0', '1.0.1', '1.0.2', '1.1.0', '1.1.1']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: v })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      }

      await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', { public: true })

      const detail = await admin.get('/api/v1/artefacts/%40test%2Fpkg%401')
      const versions = detail.data.versions.map((v: any) => v.version)
      // 1.0.x: kept 1.0.1, 1.0.2 (pruned 1.0.0)
      // 1.1.x: kept 1.1.0, 1.1.1
      expect(versions).toHaveLength(4)
      expect(versions).not.toContain('1.0.0')
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

test.describe('File artefacts', () => {
  let uploadApiKey: string

  test.beforeEach(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
  })

  test.describe('Upload', () => {
    test('upload a raw file with valid API key', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', Buffer.from('test-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form.append('category', 'tileset')

      const res = await ax.post('/api/v1/artefacts/file/terrain', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
      expect(res.data.artefact.format).toBe('file')
      expect(res.data.artefact.name).toBe('terrain')
      expect(res.data.artefact._id).toBe('terrain')
      expect(res.data.artefact.category).toBe('tileset')
      expect(res.data.artefact.filePath).toBeTruthy()
      expect(res.data.artefact.fileName).toBe('terrain.mbtiles')
    })

    test('upload without API key returns 401', async () => {
      const form = new FormData()
      form.append('file', Buffer.from('test-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })

      try {
        await anonymousAx.post('/api/v1/artefacts/file/terrain', form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(401)
      }
    })

    test('upload replaces previous file', async () => {
      const ax = axiosWithApiKey(uploadApiKey)

      const form1 = new FormData()
      form1.append('file', Buffer.from('content-v1'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form1.append('category', 'tileset')
      await ax.post('/api/v1/artefacts/file/terrain', form1, { headers: form1.getHeaders() })

      const form2 = new FormData()
      form2.append('file', Buffer.from('content-v2'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form2.append('category', 'tileset')
      const res = await ax.post('/api/v1/artefacts/file/terrain', form2, { headers: form2.getHeaders() })

      expect(res.status).toBe(201)
      // Should still be a single artefact
      const admin = await superAdmin
      const list = await admin.get('/api/v1/artefacts')
      expect(list.data.count).toBe(1)
    })

    test('upload with metadata fields', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', Buffer.from('test-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form.append('category', 'tileset')
      form.append('title', JSON.stringify({ fr: 'Terrain France', en: 'France Terrain' }))
      form.append('description', JSON.stringify({ fr: 'Un tileset', en: 'A tileset' }))

      const res = await ax.post('/api/v1/artefacts/file/terrain', form, { headers: form.getHeaders() })
      expect(res.data.artefact.title.fr).toBe('Terrain France')
      expect(res.data.artefact.description.en).toBe('A tileset')
    })
  })

  test.describe('List & Detail', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // Upload a file artefact
      const form = new FormData()
      form.append('file', Buffer.from('test-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form.append('category', 'tileset')
      await ax.post('/api/v1/artefacts/file/terrain', form, { headers: form.getHeaders() })
      await admin.patch('/api/v1/artefacts/terrain', { public: true })

      // Upload an npm artefact
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0', category: 'processing' })
      const form2 = new FormData()
      form2.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form2, { headers: form2.getHeaders() })
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg%401', { public: true })
    })

    test('both formats appear in list', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts')
      expect(res.data.count).toBe(2)
    })

    test('format filter works', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts?format=file')
      expect(res.data.count).toBe(1)
      expect(res.data.results[0].format).toBe('file')
    })

    test('category filter works for tileset', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts?category=tileset')
      expect(res.data.count).toBe(1)
      expect(res.data.results[0].name).toBe('terrain')
    })

    test('detail returns file artefact without versions array', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/terrain')
      expect(res.data.format).toBe('file')
      expect(res.data.versions).toBeUndefined()
    })

    test('detail returns npm artefact with versions array', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg%401')
      expect(res.data.versions).toHaveLength(1)
    })
  })

  test.describe('Download', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      const form = new FormData()
      form.append('file', Buffer.from('test-mbtiles-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form.append('category', 'tileset')
      await ax.post('/api/v1/artefacts/file/terrain', form, { headers: form.getHeaders() })
      await admin.patch('/api/v1/artefacts/terrain', {
        public: true,
        privateAccess: [{ type: 'organization', id: 'test1' }]
      })
    })

    test('download with internal secret', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/terrain/download', { responseType: 'arraybuffer' })
      expect(res.status).toBe(200)
      expect(res.headers['content-disposition']).toContain('terrain.mbtiles')
      expect(Buffer.from(res.data).toString()).toBe('test-mbtiles-content')
    })

    test('download with session + grant', async () => {
      const admin = await superAdmin
      await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })

      const ax = await axiosAuth('test1-admin1', { org: 'test1' })
      const res = await ax.get('/api/v1/artefacts/terrain/download', { responseType: 'arraybuffer' })
      expect(res.status).toBe(200)
    })

    test('download without access returns 403', async () => {
      const ax = await axiosAuth('dev-standalone1')
      try {
        await ax.get('/api/v1/artefacts/terrain/download')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })
  })

  test.describe('PATCH & DELETE', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', Buffer.from('test-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form.append('category', 'tileset')
      await ax.post('/api/v1/artefacts/file/terrain', form, { headers: form.getHeaders() })
    })

    test('superadmin can PATCH editable fields', async () => {
      const ax = await superAdmin
      const res = await ax.patch('/api/v1/artefacts/terrain', {
        title: { fr: 'Mon tileset', en: 'My tileset' },
        public: true
      })
      expect(res.data.title.fr).toBe('Mon tileset')
      expect(res.data.public).toBe(true)
    })

    test('superadmin can DELETE file artefact', async () => {
      const ax = await superAdmin
      const deleteRes = await ax.delete('/api/v1/artefacts/terrain')
      expect(deleteRes.status).toBe(204)

      const listRes = await ax.get('/api/v1/artefacts')
      expect(listRes.data.count).toBe(0)
    })
  })
})
