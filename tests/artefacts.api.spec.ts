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

    test('upload happy path creates an npm artefact with a single tarball', async () => {
      const tarball = await createTestTarball({
        name: '@data-fair/processing-gpkg',
        version: '1.2.3',
        licence: 'MIT'
      })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
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
      expect(typeof res.data.artefact.path).toBe('string')
      expect(typeof res.data.artefact.size).toBe('number')
      expect(res.data.artefact.size).toBeGreaterThan(0)
      expect(res.data.artefact.hasNativeModules).toBe(false)
      expect(res.data.artefact.uploadedBy.apiKeyName).toBe('test-upload')
    })

    test('upload of tarball with .node binary flags hasNativeModules=true', async () => {
      const tarball = await createTestTarball({
        name: '@test/native',
        version: '1.0.0',
        extraEntries: [{
          name: 'package/node_modules/foo/build/Release/foo.node',
          content: 'BINARY'
        }]
      })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      const ax = axiosWithApiKey(uploadApiKey)
      const res = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/native@1'),
        form,
        { headers: form.getHeaders() }
      )
      expect(res.data.artefact.hasNativeModules).toBe(true)
    })

    test('re-upload to same id swaps the tarball and bumps dataUpdatedAt', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form1 = new FormData()
      form1.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      const first = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form1,
        { headers: form1.getHeaders() }
      )
      const firstPath = first.data.artefact.path
      const firstDataAt = first.data.artefact.dataUpdatedAt

      await new Promise(resolve => setTimeout(resolve, 10))

      const form2 = new FormData()
      form2.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.1' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      const second = await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form2,
        { headers: form2.getHeaders() }
      )
      expect(second.data.artefact.path).not.toBe(firstPath)
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

      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'),
        form,
        { headers: form.getHeaders() }
      )
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true })
    })

    test('GET /download returns the artefact tarball', async () => {
      const admin = await superAdmin
      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/download',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect([200, 302]).toContain(res.status)
    })

    test('GET /download ignores legacy ?architecture= query', async () => {
      const admin = await superAdmin
      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/download?architecture=x64',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect([200, 302]).toContain(res.status)
    })

    test('GET /download exposes Last-Modified and X-Artefact-* headers for npm', async () => {
      const admin = await superAdmin
      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/download',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect(res.headers['last-modified']).toBeTruthy()
      expect(res.headers['x-artefact-version']).toBe('1.0.0')
      expect(res.headers['x-artefact-has-native-modules']).toBe('false')
      expect(res.headers['cache-control']).toBe('no-cache')
    })

    test('GET /download with matching If-Modified-Since returns 304 with metadata headers', async () => {
      const admin = await superAdmin
      const first = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/download',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      const lastModified = first.headers['last-modified']
      expect(lastModified).toBeTruthy()

      const second = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/download',
        {
          headers: { 'if-modified-since': lastModified },
          responseType: 'arraybuffer',
          maxRedirects: 0,
          validateStatus: s => s === 304
        }
      )
      expect(second.status).toBe(304)
      expect(second.headers['last-modified']).toBe(lastModified)
      expect(second.headers['x-artefact-version']).toBe('1.0.0')
      expect(second.headers['x-artefact-has-native-modules']).toBe('false')
    })

    test('GET /download with stale If-Modified-Since returns 200 with new metadata after re-upload', async () => {
      const admin = await superAdmin
      const first = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/download',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      const staleLastModified = first.headers['last-modified']

      // Wait >1s so the HTTP date moves forward (HTTP date is second-precision).
      await new Promise(resolve => setTimeout(resolve, 1100))
      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', await createTestTarball({ name: '@test/pkg', version: '2.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })

      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1') + '/download',
        {
          headers: { 'if-modified-since': staleLastModified },
          responseType: 'arraybuffer',
          maxRedirects: 0,
          validateStatus: s => s === 200 || s === 302
        }
      )
      expect(res.headers['x-artefact-version']).toBe('2.0.0')
      expect(new Date(res.headers['last-modified']).getTime())
        .toBeGreaterThan(new Date(staleLastModified).getTime())
    })

    test('GET /download flags hasNativeModules in response header', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', await createTestTarball({
        name: '@test/native-pkg',
        version: '1.0.0',
        extraEntries: [{ name: 'package/node_modules/foo/build/Release/foo.node', content: 'X' }]
      }), { filename: 'p.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/native-pkg@1'), form, { headers: form.getHeaders() })

      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/native-pkg@1'), { public: true })
      const res = await admin.get(
        '/api/v1/artefacts/' + encodeURIComponent('@test/native-pkg@1') + '/download',
        { responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302 }
      )
      expect(res.headers['x-artefact-has-native-modules']).toBe('true')
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

  test.describe('Deprecation', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })
    })

    test('PATCH can set and unset the deprecated flag', async () => {
      const ax = await superAdmin
      const id = encodeURIComponent('@test/pkg@1')
      const setRes = await ax.patch('/api/v1/artefacts/' + id, { deprecated: true })
      expect(setRes.data.deprecated).toBe(true)
      const unsetRes = await ax.patch('/api/v1/artefacts/' + id, { deprecated: false })
      expect(unsetRes.data.deprecated).toBe(false)
    })

    test('deprecated artefacts are excluded from the default list', async () => {
      const ax = await superAdmin
      await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { deprecated: true })
      const list = await ax.get('/api/v1/artefacts')
      expect(list.data.count).toBe(0)
      expect(list.data.results).toEqual([])
    })

    test('deprecated artefacts appear with includeDeprecated=true', async () => {
      const ax = await superAdmin
      await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { deprecated: true })
      const list = await ax.get('/api/v1/artefacts?includeDeprecated=true')
      expect(list.data.count).toBe(1)
      expect(list.data.results[0]._id).toBe('@test/pkg@1')
    })
  })
})
