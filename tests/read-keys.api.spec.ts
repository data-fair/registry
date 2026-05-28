import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosAuth, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

let uploadApiKey: string
let readApiKey: string

test.describe('Read API key access', () => {
  test.beforeEach(async () => {
    await clean()
    const admin = await superAdmin

    // Create upload key + upload artefacts
    const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'ci' })
    uploadApiKey = keyRes.data.key

    // Public artefact
    const tarball1 = await createTestTarball({ name: '@test/public-pkg', version: '1.0.0' })
    const form1 = new FormData()
    form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/public-pkg@1'), form1, { headers: form1.getHeaders() })
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/public-pkg@1'), {
      public: true,
      privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }]
    })

    // Private artefact visible to test1
    const tarball2 = await createTestTarball({ name: '@test/private-pkg', version: '2.0.0' })
    const form2 = new FormData()
    form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/private-pkg@2'), form2, { headers: form2.getHeaders() })
    await admin.patch('/api/v1/artefacts/' + encodeURIComponent('@test/private-pkg@2'), {
      privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }]
    })

    // Private artefact NOT visible to test1
    const tarball3 = await createTestTarball({ name: '@test/other-pkg', version: '3.0.0' })
    const form3 = new FormData()
    form3.append('file', tarball3, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/other-pkg@3'), form3, { headers: form3.getHeaders() })

    // File artefact visible to test1
    const fileForm = new FormData()
    fileForm.append('file', Buffer.from('file-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
    fileForm.append('category', 'tileset')
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/file/terrain', fileForm, { headers: fileForm.getHeaders() })
    await admin.patch('/api/v1/artefacts/terrain', {
      public: true,
      privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }]
    })

    // Grant access to test1, then create read key
    await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    const ax = await axiosAuth('test1-admin1', { org: 'test1' })
    const readKeyRes = await ax.post('/api/v1/api-keys', {
      type: 'read',
      name: 'federation-key',
      owner: { type: 'organization', id: 'test1' }
    })
    readApiKey = readKeyRes.data.key
  })

  test.describe('List', () => {
    test('read key sees public + privateAccess artefacts', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts')
      expect(res.data.count).toBe(3) // public-pkg, private-pkg, terrain
      const names = res.data.results.map((a: any) => a.packageName ?? a.name)
      expect(names).toContain('@test/public-pkg')
      expect(names).toContain('@test/private-pkg')
      expect(names).toContain('terrain')
      expect(names).not.toContain('@test/other-pkg')
    })
  })

  test.describe('Detail', () => {
    test('read key can get artefact detail', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/public-pkg@1'))
      expect(res.data.packageName).toBe('@test/public-pkg')
      expect(typeof res.data.path).toBe('string')
    })

    test('read key cannot get artefact outside scope', async () => {
      const ax = axiosWithApiKey(readApiKey)
      try {
        await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/other-pkg@3'))
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })
  })

  test.describe('Tarball download', () => {
    test('read key can download tarball', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/public-pkg@1') + '/download', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('gzip')
    })

    test('read key can download private artefact tarball', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/private-pkg@2') + '/download', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
    })

    test('read key cannot download artefact outside scope', async () => {
      const ax = axiosWithApiKey(readApiKey)
      try {
        await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/other-pkg@3') + '/download')
        expect(true).toBe(false)
      } catch (err: any) {
        // Download endpoint surfaces 403 for permission errors so callers
        // can distinguish "missing" from "not allowed" — see router note.
        expect(err.status).toBe(403)
      }
    })
  })

  test.describe('File download', () => {
    test('read key can download file artefact', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/terrain/download', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
      expect(Buffer.from(res.data).toString()).toBe('file-content')
    })
  })

  test.describe('No grant', () => {
    // Access-grants gate downloads (and read-key creation), not listing.
    // A read key whose owner has no grant can still browse the catalog —
    // they see public artefacts plus any explicitly granted privateAccess —
    // but downloading is blocked.
    test('read key without grant can list public artefacts', async () => {
      const admin = await superAdmin
      await admin.post('/api/v1/access-grants', { account: { type: 'user', id: 'test-standalone1' } })
      const keyRes = await admin.post('/api/v1/api-keys', {
        type: 'read',
        name: 'no-grant-key',
        owner: { type: 'user', id: 'test-standalone1' }
      })
      const grants = await admin.get('/api/v1/access-grants')
      const grant = grants.data.results.find((g: any) => g.account.id === 'test-standalone1')
      await admin.delete(`/api/v1/access-grants/${grant._id}`)

      const ax = axiosWithApiKey(keyRes.data.key)
      const res = await ax.get('/api/v1/artefacts')
      const names = res.data.results.map((a: any) => a.packageName ?? a.name)
      // test-standalone1 has no privateAccess on any artefact, so only public ones show up.
      expect(names).toContain('@test/public-pkg')
      expect(names).toContain('terrain')
      expect(names).not.toContain('@test/private-pkg')
      expect(names).not.toContain('@test/other-pkg')
    })

    test('read key without grant cannot download tarballs', async () => {
      const admin = await superAdmin
      await admin.post('/api/v1/access-grants', { account: { type: 'user', id: 'test-standalone1' } })
      const keyRes = await admin.post('/api/v1/api-keys', {
        type: 'read',
        name: 'no-grant-key-2',
        owner: { type: 'user', id: 'test-standalone1' }
      })
      const grants = await admin.get('/api/v1/access-grants')
      const grant = grants.data.results.find((g: any) => g.account.id === 'test-standalone1')
      await admin.delete(`/api/v1/access-grants/${grant._id}`)

      const ax = axiosWithApiKey(keyRes.data.key)
      try {
        await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/public-pkg@1') + '/download')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('read key without grant cannot download file artefacts', async () => {
      const admin = await superAdmin
      await admin.post('/api/v1/access-grants', { account: { type: 'user', id: 'test-standalone1' } })
      const keyRes = await admin.post('/api/v1/api-keys', {
        type: 'read',
        name: 'no-grant-key-3',
        owner: { type: 'user', id: 'test-standalone1' }
      })
      const grants = await admin.get('/api/v1/access-grants')
      const grant = grants.data.results.find((g: any) => g.account.id === 'test-standalone1')
      await admin.delete(`/api/v1/access-grants/${grant._id}`)

      const ax = axiosWithApiKey(keyRes.data.key)
      try {
        await ax.get('/api/v1/artefacts/terrain/download')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })
  })
})
