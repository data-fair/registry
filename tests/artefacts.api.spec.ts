import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, anonymousAx, axiosAuth, axiosWithApiKey, axiosInternal, clean, resetSize, runBackfillSize, resetDataUpdatedAt, runBackfillDataUpdatedAt } from './support/axios.ts'
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

      // Audit trail: version detail carries uploadedBy
      const admin = await superAdmin
      const detail = await admin.get(`/api/v1/artefacts/${encodeURIComponent(res.data.artefact._id)}/versions/1.0.0`)
      expect(detail.data.uploadedBy).toBeTruthy()
      expect(detail.data.uploadedBy.shortId).toBeTruthy()
      expect(detail.data.uploadedBy.apiKeyName).toBe('test-upload')
      expect(typeof detail.data.size).toBe('number')
      expect(detail.data.size).toBeGreaterThan(0)
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
        allowedName: 'terrain-france'
      })
      const scopedKey = keyRes.data.key
      expect(keyRes.data.allowedName).toBe('terrain-france')

      const upload = axiosWithApiKey(scopedKey)

      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      const res = await upload.post('/api/v1/artefacts/file/terrain-france', fileForm, { headers: fileForm.getHeaders() })
      expect(res.status).toBe(201)
    })

    test('scoped upload key rejects non-matching name', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'scoped',
        allowedName: 'terrain-france'
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

    test('category-scoped upload key accepts matching category', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'tileset-only',
        allowedCategory: 'tileset'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'a.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      const res = await upload.post('/api/v1/artefacts/file/terrain-a', fileForm, { headers: fileForm.getHeaders() })
      expect(res.status).toBe(201)
    })

    test('category-scoped upload key rejects mismatched file category', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'tileset-only',
        allowedCategory: 'tileset'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'a.json', contentType: 'application/octet-stream' })
      fileForm.append('category', 'maplibre-style')
      try {
        await upload.post('/api/v1/artefacts/file/style-a', fileForm, { headers: fileForm.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('category-scoped upload key rejects mismatched npm manifest category', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'processing-only',
        allowedCategory: 'processing'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      const tarball = await createTestTarball({ name: '@test/cat-pkg', version: '1.0.0', category: 'catalog' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      try {
        await upload.post('/api/v1/artefacts/%40test%2Fcat-pkg/versions', form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('upload key with both name and category scopes requires both to match', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'terrain-tileset',
        allowedName: 'terrain-france',
        allowedCategory: 'tileset'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      // Matches both — accepted
      const okForm = new FormData()
      okForm.append('file', Buffer.from('x'), { filename: 'a.mbtiles', contentType: 'application/octet-stream' })
      okForm.append('category', 'tileset')
      const ok = await upload.post('/api/v1/artefacts/file/terrain-france', okForm, { headers: okForm.getHeaders() })
      expect(ok.status).toBe(201)

      // Name matches, category doesn't — rejected
      const badCatForm = new FormData()
      badCatForm.append('file', Buffer.from('x'), { filename: 'a.json', contentType: 'application/octet-stream' })
      badCatForm.append('category', 'maplibre-style')
      try {
        await upload.post('/api/v1/artefacts/file/terrain-france', badCatForm, { headers: badCatForm.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('unscoped upload key still accepts any name', async () => {
      // The default key created in beforeEach has no allowedName — unrestricted.
      const upload = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@anywhere/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      const res = await upload.post('/api/v1/artefacts/%40anywhere%2Fpkg/versions', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
    })

    test('internal secret can upload npm version', async () => {
      const ax = axiosInternal('secret-internal')
      const tarball = await createTestTarball({ name: '@test/internal-pkg', version: '1.0.0', category: 'processing' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      const res = await ax.post('/api/v1/artefacts/%40test%2Finternal-pkg/versions', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
      expect(res.data.artefact.name).toBe('@test/internal-pkg')

      const admin = await superAdmin
      const detail = await admin.get(`/api/v1/artefacts/${encodeURIComponent(res.data.artefact._id)}/versions/1.0.0`)
      expect(detail.data.uploadedBy.internal).toBe(true)
    })

    test('internal secret can upload raw file', async () => {
      const ax = axiosInternal('secret-internal')
      const form = new FormData()
      form.append('file', Buffer.from('internal-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form.append('category', 'tileset')
      const res = await ax.post('/api/v1/artefacts/file/terrain-internal', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
      expect(res.data.artefact.name).toBe('terrain-internal')
      expect(res.data.artefact.uploadedBy.internal).toBe(true)
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

    test('internal secret sees all artefacts in list', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts')
      expect(res.data.count).toBe(2)
    })

    test('internal secret can get private artefact detail', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/%40test%2Fprivate-pkg%402')
      expect(res.data.name).toBe('@test/private-pkg')
    })

    test('internal secret can resolve version on private artefact', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/%40test%2Fprivate-pkg%402/versions/2.0.0')
      expect(res.data.version).toBe('2.0.0')
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

  // TODO: remove with backfill-size upgrade
  test.describe('Size backfill', () => {
    test('backfill restores size on artefacts and versions missing it', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // npm version
      const tarball = await createTestTarball({ name: '@test/sized-pkg', version: '1.0.0' })
      const tarballSize = tarball.length
      const npmForm = new FormData()
      npmForm.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fsized-pkg/versions', npmForm, { headers: npmForm.getHeaders() })

      // file artefact
      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('hello-world-bytes'), { filename: 'a.bin', contentType: 'application/octet-stream' })
      fileForm.append('category', 'other')
      await ax.post('/api/v1/artefacts/file/sized-file', fileForm, { headers: fileForm.getHeaders() })

      // Simulate pre-existing rows: drop size, then run upgrade
      await resetSize()
      const beforeNpm = await admin.get('/api/v1/artefacts/%40test%2Fsized-pkg%401/versions/1.0.0')
      expect(beforeNpm.data.size).toBeUndefined()
      const beforeFile = await admin.get('/api/v1/artefacts/sized-file')
      expect(beforeFile.data.size).toBeUndefined()

      await runBackfillSize()

      const afterNpm = await admin.get('/api/v1/artefacts/%40test%2Fsized-pkg%401/versions/1.0.0')
      expect(afterNpm.data.size).toBe(tarballSize)
      const afterFile = await admin.get('/api/v1/artefacts/sized-file')
      expect(afterFile.data.size).toBe(Buffer.byteLength('hello-world-bytes'))
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
      const npmRes = await ax.post('/api/v1/artefacts/%40test%2Fdata-pkg/versions', npmForm, { headers: npmForm.getHeaders() })
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
      await admin.patch('/api/v1/artefacts/%40test%2Fdata-pkg%401', { public: true })
      const npmAfterPatch = await admin.get('/api/v1/artefacts/%40test%2Fdata-pkg%401')
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
      const npmRes2 = await ax.post('/api/v1/artefacts/%40test%2Fdata-pkg/versions', npmForm2, { headers: npmForm2.getHeaders() })
      expect(npmRes2.data.artefact.dataUpdatedAt > initialNpmDataUpdatedAt).toBe(true)

      // Re-upload bumps dataUpdatedAt for file
      const fileForm2 = new FormData()
      fileForm2.append('file', Buffer.from('data2'), { filename: 'a.bin', contentType: 'application/octet-stream' })
      fileForm2.append('category', 'other')
      const fileRes2 = await ax.post('/api/v1/artefacts/file/data-file', fileForm2, { headers: fileForm2.getHeaders() })
      expect(fileRes2.data.artefact.dataUpdatedAt > initialFileDataUpdatedAt).toBe(true)
    })

    // TODO: remove with backfill-data-updated-at upgrade
    test('backfill restores dataUpdatedAt on artefacts missing it', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // npm artefact with two versions — backfill should pick the latest version's uploadedAt
      const tarball1 = await createTestTarball({ name: '@test/data-pkg', version: '1.0.0' })
      const npmForm1 = new FormData()
      npmForm1.append('file', tarball1, { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fdata-pkg/versions', npmForm1, { headers: npmForm1.getHeaders() })
      await new Promise(resolve => setTimeout(resolve, 5))
      const tarball2 = await createTestTarball({ name: '@test/data-pkg', version: '1.0.1' })
      const npmForm2 = new FormData()
      npmForm2.append('file', tarball2, { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fdata-pkg/versions', npmForm2, { headers: npmForm2.getHeaders() })

      const latestVersion = await admin.get('/api/v1/artefacts/%40test%2Fdata-pkg%401/versions/1.0.1')
      const latestUploadedAt = latestVersion.data.uploadedAt

      // file artefact
      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('data'), { filename: 'a.bin', contentType: 'application/octet-stream' })
      fileForm.append('category', 'other')
      const fileUploadedBefore = Date.now()
      await ax.post('/api/v1/artefacts/file/data-file', fileForm, { headers: fileForm.getHeaders() })
      const fileUploadedAfter = Date.now()

      // Simulate pre-existing rows
      await resetDataUpdatedAt()
      const beforeNpm = await admin.get('/api/v1/artefacts/%40test%2Fdata-pkg%401')
      expect(beforeNpm.data.dataUpdatedAt).toBeUndefined()
      const beforeFile = await admin.get('/api/v1/artefacts/data-file')
      expect(beforeFile.data.dataUpdatedAt).toBeUndefined()

      await runBackfillDataUpdatedAt()

      const afterNpm = await admin.get('/api/v1/artefacts/%40test%2Fdata-pkg%401')
      expect(afterNpm.data.dataUpdatedAt).toBe(latestUploadedAt)
      // File-format artefacts derive dataUpdatedAt from the storage backend's
      // last-modified time — assert it's set within the upload window
      // (filesystem mtime can have second-resolution, so allow a small slack).
      const afterFile = await admin.get('/api/v1/artefacts/data-file')
      const ts = new Date(afterFile.data.dataUpdatedAt).getTime()
      expect(ts).toBeGreaterThanOrEqual(fileUploadedBefore - 1000)
      expect(ts).toBeLessThanOrEqual(fileUploadedAfter + 1000)
    })
  })
})
