import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, anonymousAx, axiosWithApiKey, axiosInternal, clean, setArtefactOrigin } from './support/axios.ts'
import { createSpaTarball, createTestTarball } from './support/test-tarball.ts'

const spaId = '@test/app-charts@0.30'
const encodedSpaId = encodeURIComponent(spaId)

const uploadSpa = async (apiKey: string, id: string, opts: { name: string, version: string, files?: Record<string, string> }) => {
  const tarball = await createSpaTarball(opts)
  const form = new FormData()
  form.append('file', tarball, { filename: 'spa.tgz', contentType: 'application/gzip' })
  return axiosWithApiKey(apiKey).post('/api/v1/artefacts/spa/' + encodeURIComponent(id), form, { headers: form.getHeaders() })
}

test.describe('SPA artefacts', () => {
  let uploadApiKey: string

  test.beforeEach(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
  })

  test.describe('Upload', () => {
    test('upload a spa artefact with valid API key', async () => {
      const res = await uploadSpa(uploadApiKey, spaId, { name: '@test/app-charts', version: '0.30.2' })
      expect(res.status).toBe(201)
      expect(res.data.artefact.format).toBe('spa')
      expect(res.data.artefact._id).toBe(spaId)
      expect(res.data.artefact.packageName).toBe('@test/app-charts')
      expect(res.data.artefact.version).toBe('0.30.2')
      expect(res.data.artefact.category).toBe('application')
      expect(res.data.artefact.tarballPath).toBeTruthy()
      expect(res.data.artefact.extractedPath).toBeTruthy()
      expect(res.data.artefact.size).toBeGreaterThan(0)
    })

    test('upload without API key returns 401', async () => {
      const tarball = await createSpaTarball({ name: '@test/app-charts', version: '0.30.2' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'spa.tgz', contentType: 'application/gzip' })
      try {
        await anonymousAx.post('/api/v1/artefacts/spa/' + encodedSpaId, form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(401)
      }
    })

    test('id not matching <name>@<major>.<minor> returns 400', async () => {
      try {
        await uploadSpa(uploadApiKey, '@test/app-charts@0.30.2', { name: '@test/app-charts', version: '0.30.2' })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(400)
      }
    })

    test('tarball without index.html returns 400', async () => {
      try {
        await uploadSpa(uploadApiKey, spaId, {
          name: '@test/app-charts',
          version: '0.30.2',
          files: { 'assets/app.js': 'x' }
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(400)
      }
    })

    test('re-upload replaces the tarball and removes stale files', async () => {
      const res1 = await uploadSpa(uploadApiKey, spaId, {
        name: '@test/app-charts',
        version: '0.30.1',
        files: { 'index.html': '<html></html>', 'assets/old.js': 'old' }
      })
      const res2 = await uploadSpa(uploadApiKey, spaId, {
        name: '@test/app-charts',
        version: '0.30.2',
        files: { 'index.html': '<html></html>', 'assets/new.js': 'new' }
      })
      expect(res2.status).toBe(201)
      expect(res2.data.artefact.version).toBe('0.30.2')
      expect(res2.data.artefact.extractedPath).not.toBe(res1.data.artefact.extractedPath)
      expect(res2.data.artefact.tarballPath).not.toBe(res1.data.artefact.tarballPath)

      const admin = await superAdmin
      const list = await admin.get('/api/v1/artefacts')
      expect(list.data.count).toBe(1)
    })

    test('delete spa artefact removes it from the list', async () => {
      await uploadSpa(uploadApiKey, spaId, { name: '@test/app-charts', version: '0.30.2' })
      const admin = await superAdmin
      const del = await admin.delete('/api/v1/artefacts/' + encodedSpaId)
      expect(del.status).toBe(204)
      const list = await admin.get('/api/v1/artefacts')
      expect(list.data.count).toBe(0)
    })

    test('upload to a mirrored spa artefact returns 409', async () => {
      await uploadSpa(uploadApiKey, spaId, { name: '@test/app-charts', version: '0.30.1' })
      await setArtefactOrigin(spaId, 'https://upstream.example.com')
      try {
        await uploadSpa(uploadApiKey, spaId, { name: '@test/app-charts', version: '0.30.2' })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })

    test('format conflict with an existing npm artefact returns 409', async () => {
      const tarball = await createTestTarball({ name: '@test/app-charts', version: '0.30.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodedSpaId, form, { headers: form.getHeaders() })
      try {
        await uploadSpa(uploadApiKey, spaId, { name: '@test/app-charts', version: '0.30.2' })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })
  })

  test.describe('Static serving', () => {
    test.beforeEach(async () => {
      await uploadSpa(uploadApiKey, spaId, {
        name: '@test/app-charts',
        version: '0.30.2',
        files: {
          'index.html': '<!doctype html><html><body>%APPLICATION%</body></html>',
          'assets/app.js': 'console.log("spa")',
          'config-schema.json': '{"type":"object"}'
        }
      })
    })

    test('serves a public asset file', async () => {
      const res = await anonymousAx.get('/apps/@test/app-charts/0.30/assets/app.js')
      expect(res.status).toBe(200)
      expect(res.data).toContain('console.log')
      expect(res.headers['content-type']).toContain('text/javascript')
      expect(res.headers['cache-control']).toContain('immutable')
    })

    test('serves config-schema.json publicly', async () => {
      const res = await anonymousAx.get('/apps/@test/app-charts/0.30/config-schema.json')
      expect(res.status).toBe(200)
      expect(res.data).toEqual({ type: 'object' })
    })

    test('index.html is not served anonymously', async () => {
      try {
        await anonymousAx.get('/apps/@test/app-charts/0.30/index.html')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('the directory root is not served anonymously', async () => {
      try {
        await anonymousAx.get('/apps/@test/app-charts/0.30/')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('index.html is served with the internal secret', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/apps/@test/app-charts/0.30/index.html')
      expect(res.status).toBe(200)
      expect(res.data).toContain('%APPLICATION%')
    })

    test('unknown file returns 404', async () => {
      try {
        await anonymousAx.get('/apps/@test/app-charts/0.30/assets/missing.js')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('unknown artefact returns 404', async () => {
      try {
        await anonymousAx.get('/apps/@test/nope/9.9/assets/app.js')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })
  })

  test.describe('Tarball download', () => {
    test.beforeEach(async () => {
      await uploadSpa(uploadApiKey, spaId, { name: '@test/app-charts', version: '0.30.2' })
    })

    test('download the spa tarball with the internal secret', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/' + encodedSpaId + '/spa-tarball', { responseType: 'arraybuffer' })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('gzip')
      expect(Buffer.from(res.data).length).toBeGreaterThan(0)
    })

    test('spa-tarball on a non-spa artefact returns 400', async () => {
      const tarball = await createTestTarball({ name: '@test/np', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/np@1'), form, { headers: form.getHeaders() })
      const ax = axiosInternal('secret-internal')
      try {
        await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/np@1') + '/spa-tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(400)
      }
    })
  })
})
