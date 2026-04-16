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
    const tarball1 = await createTestTarball({ name: '@test/public-pkg', version: '1.0.0', category: 'processing' })
    const form1 = new FormData()
    form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fpublic-pkg/versions', form1, { headers: form1.getHeaders() })
    await admin.patch('/api/v1/artefacts/%40test%2Fpublic-pkg%401', {
      public: true,
      privateAccess: [{ type: 'organization', id: 'test1' }]
    })

    // Private artefact visible to test1
    const tarball2 = await createTestTarball({ name: '@test/private-pkg', version: '2.0.0', category: 'catalog' })
    const form2 = new FormData()
    form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fprivate-pkg/versions', form2, { headers: form2.getHeaders() })
    await admin.patch('/api/v1/artefacts/%40test%2Fprivate-pkg%402', {
      privateAccess: [{ type: 'organization', id: 'test1' }]
    })

    // Private artefact NOT visible to test1
    const tarball3 = await createTestTarball({ name: '@test/other-pkg', version: '3.0.0', category: 'processing' })
    const form3 = new FormData()
    form3.append('file', tarball3, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fother-pkg/versions', form3, { headers: form3.getHeaders() })

    // File artefact visible to test1
    const fileForm = new FormData()
    fileForm.append('file', Buffer.from('file-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
    fileForm.append('category', 'tileset')
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/file/terrain', fileForm, { headers: fileForm.getHeaders() })
    await admin.patch('/api/v1/artefacts/terrain', {
      public: true,
      privateAccess: [{ type: 'organization', id: 'test1' }]
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
      const names = res.data.results.map((a: any) => a.name)
      expect(names).toContain('@test/public-pkg')
      expect(names).toContain('@test/private-pkg')
      expect(names).toContain('terrain')
      expect(names).not.toContain('@test/other-pkg')
    })
  })

  test.describe('Detail', () => {
    test('read key can get artefact detail', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpublic-pkg%401')
      expect(res.data.name).toBe('@test/public-pkg')
      expect(res.data.versions).toHaveLength(1)
    })

    test('read key cannot get artefact outside scope', async () => {
      const ax = axiosWithApiKey(readApiKey)
      try {
        await ax.get('/api/v1/artefacts/%40test%2Fother-pkg%403')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })
  })

  test.describe('Version resolution', () => {
    test('read key can resolve version', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpublic-pkg%401/versions/1')
      expect(res.data.version).toBe('1.0.0')
    })
  })

  test.describe('Tarball download', () => {
    test('read key can download tarball', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpublic-pkg%401/versions/1.0.0/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('gzip')
    })

    test('read key can download private artefact tarball', async () => {
      const ax = axiosWithApiKey(readApiKey)
      const res = await ax.get('/api/v1/artefacts/%40test%2Fprivate-pkg%402/versions/2.0.0/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
    })

    test('read key cannot download artefact outside scope', async () => {
      const ax = axiosWithApiKey(readApiKey)
      try {
        await ax.get('/api/v1/artefacts/%40test%2Fother-pkg%403/versions/3.0.0/tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
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
    test('read key for account without grant gets 403', async () => {
      const admin = await superAdmin
      // Grant access to dev1, create a read key, then revoke the grant
      await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'dev1' } })
      const keyRes = await admin.post('/api/v1/api-keys', {
        type: 'read',
        name: 'no-grant-key',
        owner: { type: 'organization', id: 'dev1' }
      })
      const grants = await admin.get('/api/v1/access-grants')
      const dev1Grant = grants.data.results.find((g: any) => g.account.id === 'dev1')
      await admin.delete(`/api/v1/access-grants/${dev1Grant._id}`)
      const ax = axiosWithApiKey(keyRes.data.key)
      try {
        await ax.get('/api/v1/artefacts')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })
  })
})
