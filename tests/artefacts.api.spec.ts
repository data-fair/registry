import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, anonymousAx, clean } from './support/axios.ts'
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

  test.describe('Unified npm upload', () => {
    test.beforeEach(async () => {
      await clean()
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
      uploadApiKey = keyRes.data.key
    })

    test('upload happy path creates an npm artefact with one tarball slot', async () => {
      const tarball = await createTestTarball({
        name: '@data-fair/processing-gpkg',
        version: '1.2.3',
        licence: 'MIT'
      })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      form.append('architecture', 'x64')
      form.append('category', 'processing')

      const ax = axiosWithApiKey(uploadApiKey)
      const res = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@data-fair/processing-gpkg@1'),
        form,
        { headers: form.getHeaders() }
      )
      expect(res.status).toBe(201)
      expect(res.data.artefact._id).toBe('@data-fair/processing-gpkg@1')
      expect(res.data.artefact.format).toBe('npm')
      expect(res.data.artefact.packageName).toBe('@data-fair/processing-gpkg')
      expect(res.data.artefact.version).toBe('1.2.3')
      expect(res.data.artefact.category).toBe('processing')
      expect(res.data.artefact.tarballs).toBeTruthy()
      expect(res.data.artefact.tarballs.x64).toBeTruthy()
      expect(typeof res.data.artefact.tarballs.x64.size).toBe('number')
      expect(res.data.artefact.tarballs.x64.size).toBeGreaterThan(0)
      expect(res.data.artefact.tarballs.x64.uploadedBy.apiKeyName).toBe('test-upload')
    })

    test('upload without architecture form field defaults to noarch slot', async () => {
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

      const ax = axiosWithApiKey(uploadApiKey)
      const res = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form,
        { headers: form.getHeaders() }
      )
      expect(res.status).toBe(201)
      expect(res.data.artefact.tarballs.noarch).toBeTruthy()
      expect(res.data.artefact.tarballs.x64).toBeUndefined()
    })

    test('per-arch upload updates only that slot', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      for (const arch of ['x64', 'arm64']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        form.append('architecture', arch)
        await ax.post(
          '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
          form,
          { headers: form.getHeaders() }
        )
      }
      const admin = await superAdmin
      const detail = await admin.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'))
      expect(Object.keys(detail.data.tarballs).sort()).toEqual(['arm64', 'x64'])
    })

    test('re-upload to same arch swaps the tarball and bumps dataUpdatedAt', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form1 = new FormData()
      form1.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      form1.append('architecture', 'x64')
      const first = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form1,
        { headers: form1.getHeaders() }
      )
      const firstPath = first.data.artefact.tarballs.x64.path
      const firstDataAt = first.data.artefact.dataUpdatedAt

      await new Promise(resolve => setTimeout(resolve, 10))

      const form2 = new FormData()
      form2.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.1' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      form2.append('architecture', 'x64')
      const second = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form2,
        { headers: form2.getHeaders() }
      )
      expect(second.data.artefact.tarballs.x64.path).not.toBe(firstPath)
      expect(second.data.artefact.version).toBe('1.0.1')
      expect(second.data.artefact.dataUpdatedAt).not.toBe(firstDataAt)
    })

    test('re-upload with different manifest name on the same artefact id returns 409', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form1 = new FormData()
      form1.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form1,
        { headers: form1.getHeaders() }
      )

      const form2 = new FormData()
      form2.append('file', await createTestTarball({ name: '@other/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      try {
        await ax.post(
          '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
          form2,
          { headers: form2.getHeaders() }
        )
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })
  })

  test.describe('Unified npm download', () => {
    test.beforeEach(async () => {
      await clean()
      const admin = await superAdmin
      const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
      uploadApiKey = keyRes.data.key

      // Two arch slots for @test/pkg@1
      const ax = axiosWithApiKey(uploadApiKey)
      for (const arch of ['x64', 'arm64']) {
        const form = new FormData()
        form.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
        form.append('architecture', arch)
        await ax.post(
          '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
          form,
          { headers: form.getHeaders() }
        )
      }
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    })

    test('download with explicit arch returns the matching slot', async () => {
      const admin = await superAdmin
      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/tarball?architecture=x64',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect([200, 302]).toContain(res.status)
    })

    test('download with no arch on an arch-only artefact returns 404', async () => {
      const admin = await superAdmin
      try {
        await admin.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('download falls back to noarch when arch slot is absent', async () => {
      // Upload a noarch tarball for a different id
      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', await createTestTarball({ name: '@test/portable', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/portable@1'),
        form,
        { headers: form.getHeaders() }
      )
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/portable@1'), { public: true })

      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/portable@1') + '/tarball?architecture=x64',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect([200, 302]).toContain(res.status)
    })
  })

  test.describe('PATCH & DELETE', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })
    })

    test('superadmin can PATCH editable metadata', async () => {
      const ax = await superAdmin
      const res = await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), {
        title: { fr: 'Mon paquet', en: 'My package' },
        description: { fr: 'Une description', en: 'A description' },
        public: true
      })
      expect(res.data.title.fr).toBe('Mon paquet')
      expect(res.data.public).toBe(true)
    })

    test('superadmin can DELETE artefact', async () => {
      const ax = await superAdmin
      const deleteRes = await ax.delete('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'))
      expect(deleteRes.status).toBe(204)

      const listRes = await ax.get('/api/v1/artefacts')
      expect(listRes.data.count).toBe(0)
    })
  })

  test.describe('Group suggestions', () => {
    // Upload an npm artefact in a category, then set its group via PATCH
    // (group is only settable through the patch endpoint).
    const uploadWithGroup = async (name: string, category: string, group: { en?: string, fr?: string }) => {
      const id = name + '@1'
      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', await createTestTarball({ name, version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      form.append('category', category)
      await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent(id), form, { headers: form.getHeaders() })
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent(id), { group })
    }

    test('returns distinct sorted group values for a category and locale', async () => {
      await uploadWithGroup('@test/proc-a', 'processing', { en: 'Statistics', fr: 'Statistiques' })
      await uploadWithGroup('@test/proc-b', 'processing', { en: 'Geospatial', fr: 'Géospatial' })
      await uploadWithGroup('@test/proc-c', 'processing', { en: 'Statistics', fr: 'Statistiques' })

      const admin = await superAdmin
      const en = await admin.get('/api/v1/artefacts/groups?category=processing&locale=en')
      expect(en.data.results).toEqual(['Geospatial', 'Statistics'])

      const fr = await admin.get('/api/v1/artefacts/groups?category=processing&locale=fr')
      expect(fr.data.results).toEqual(['Géospatial', 'Statistiques'])
    })

    test('scopes suggestions to the requested category', async () => {
      await uploadWithGroup('@test/proc-a', 'processing', { en: 'Statistics' })
      await uploadWithGroup('@test/cat-a', 'catalog', { en: 'Catalogs' })

      const admin = await superAdmin
      const res = await admin.get('/api/v1/artefacts/groups?category=catalog&locale=en')
      expect(res.data.results).toEqual(['Catalogs'])
    })

    test('rejects an invalid category', async () => {
      const admin = await superAdmin
      try {
        await admin.get('/api/v1/artefacts/groups?category=nope&locale=en')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(400)
      }
    })

    test('rejects a missing locale', async () => {
      const admin = await superAdmin
      try {
        await admin.get('/api/v1/artefacts/groups?category=processing')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(400)
      }
    })

    test('rejects a non-admin caller', async () => {
      try {
        await anonymousAx.get('/api/v1/artefacts/groups?category=processing&locale=en')
        expect(true).toBe(false)
      } catch (err: any) {
        expect([401, 403]).toContain(err.status)
      }
    })
  })
})
