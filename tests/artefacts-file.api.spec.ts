import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, anonymousAx, axiosAuth, axiosWithApiKey, axiosInternal, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

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
      expect(res.data.artefact.path).toBeTruthy()
      expect(res.data.artefact.fileName).toBe('terrain.mbtiles')
      expect(res.data.artefact.size).toBe(Buffer.byteLength('test-content'))
      expect(res.data.artefact.uploadedBy).toBeTruthy()
      expect(res.data.artefact.uploadedBy.shortId).toBeTruthy()
      expect(res.data.artefact.uploadedBy.apiKeyName).toBe('test-upload')
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
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form2 = new FormData()
      form2.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form2, { headers: form2.getHeaders() })
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
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

    test('detail returns npm artefact with path', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'))
      expect(typeof res.data.path).toBe('string')
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
        privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }]
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

  test.describe('dataUpdatedAt', () => {
    test('upload sets dataUpdatedAt; metadata patch leaves it unchanged', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // npm artefact
      const tarball = await createTestTarball({ name: '@test/data-pkg', version: '1.0.0' })
      const npmForm = new FormData()
      npmForm.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      const npmRes = await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/data-pkg@1'), npmForm, { headers: npmForm.getHeaders() })
      const initialNpmDataUpdatedAt = npmRes.data.artefact.dataUpdatedAt
      expect(initialNpmDataUpdatedAt).toBeTruthy()
      expect(initialNpmDataUpdatedAt).toBe(npmRes.data.artefact.updatedAt)

      // file artefact
      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('data'), { filename: 'a.bin', contentType: 'application/octet-stream' })
      fileForm.append('category', 'other')
      const fileRes = await ax.post('/api/v1/artefacts/file/data-file', fileForm, { headers: fileForm.getHeaders() })
      const initialFileDataUpdatedAt = fileRes.data.artefact.dataUpdatedAt
      expect(initialFileDataUpdatedAt).toBeTruthy()

      // Wait a tick so timestamps would differ if dataUpdatedAt moved
      await new Promise(resolve => setTimeout(resolve, 5))

      // Metadata-only PATCH bumps updatedAt but not dataUpdatedAt
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/data-pkg@1'), { public: true })
      const npmAfterPatch = await admin.get('/api/v1/artefacts/' + encodeURIComponent('@test/data-pkg@1'))
      expect(npmAfterPatch.data.dataUpdatedAt).toBe(initialNpmDataUpdatedAt)
      expect(npmAfterPatch.data.updatedAt).not.toBe(initialNpmDataUpdatedAt)

      await admin.patch('/api/v1/artefacts/data-file', { public: true })
      const fileAfterPatch = await admin.get('/api/v1/artefacts/data-file')
      expect(fileAfterPatch.data.dataUpdatedAt).toBe(initialFileDataUpdatedAt)
      expect(fileAfterPatch.data.updatedAt).not.toBe(initialFileDataUpdatedAt)

      // New version bumps dataUpdatedAt for npm
      await new Promise(resolve => setTimeout(resolve, 5))
      const tarball2 = await createTestTarball({ name: '@test/data-pkg', version: '1.0.1' })
      const npmForm2 = new FormData()
      npmForm2.append('file', tarball2, { filename: 'p.tgz', contentType: 'application/gzip' })
      const npmRes2 = await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/data-pkg@1'), npmForm2, { headers: npmForm2.getHeaders() })
      expect(npmRes2.data.artefact.dataUpdatedAt > initialNpmDataUpdatedAt).toBe(true)

      // Re-upload bumps dataUpdatedAt for file
      const fileForm2 = new FormData()
      fileForm2.append('file', Buffer.from('data2'), { filename: 'a.bin', contentType: 'application/octet-stream' })
      fileForm2.append('category', 'other')
      const fileRes2 = await ax.post('/api/v1/artefacts/file/data-file', fileForm2, { headers: fileForm2.getHeaders() })
      expect(fileRes2.data.artefact.dataUpdatedAt > initialFileDataUpdatedAt).toBe(true)
    })
  })
})
