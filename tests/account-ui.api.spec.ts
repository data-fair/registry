import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, anonymousAx, axiosAuth, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

let uploadApiKey: string

test.describe('Account-facing access patterns', () => {
  test.beforeEach(async () => {
    await clean()
    const admin = await superAdmin
    const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'ci' })
    uploadApiKey = keyRes.data.key

    // Upload a public artefact
    const tarball1 = await createTestTarball({ name: '@test/public-pkg', version: '1.0.0', category: 'processing' })
    const form1 = new FormData()
    form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fpublic-pkg/versions', form1, { headers: form1.getHeaders() })
    await admin.patch('/api/v1/artefacts/%40test%2Fpublic-pkg%401', { public: true })

    // Upload a private artefact with test1 org access
    const tarball2 = await createTestTarball({ name: '@test/private-pkg', version: '2.0.0', category: 'catalog' })
    const form2 = new FormData()
    form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/%40test%2Fprivate-pkg/versions', form2, { headers: form2.getHeaders() })
    await admin.patch('/api/v1/artefacts/%40test%2Fprivate-pkg%402', {
      privateAccess: [{ type: 'organization', id: 'test1' }]
    })

    // Grant access to test1 org
    await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
  })

  test('anonymous sees only public artefacts', async () => {
    const res = await anonymousAx.get('/api/v1/artefacts')
    expect(res.data.count).toBe(1)
    expect(res.data.results[0].name).toBe('@test/public-pkg')
  })

  test('authenticated user without grant sees public + privateAccess artefacts', async () => {
    const ax = await axiosAuth('test1-admin1', { org: 'test1' })
    const res = await ax.get('/api/v1/artefacts')
    expect(res.data.count).toBe(2)
  })

  test('authenticated user without grant cannot download', async () => {
    const ax = await axiosAuth('dev-standalone1')
    try {
      await ax.get('/api/v1/artefacts/%40test%2Fpublic-pkg%401/versions/1.0.0/tarball')
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(403)
    }
  })

  test('user with grant can download public artefact', async () => {
    const ax = await axiosAuth('test1-admin1', { org: 'test1' })
    const res = await ax.get('/api/v1/artefacts/%40test%2Fpublic-pkg%401/versions/1.0.0/tarball', {
      responseType: 'arraybuffer'
    })
    expect(res.status).toBe(200)
  })

  test('user with grant can download private artefact in privateAccess', async () => {
    const ax = await axiosAuth('test1-admin1', { org: 'test1' })
    const res = await ax.get('/api/v1/artefacts/%40test%2Fprivate-pkg%402/versions/2.0.0/tarball', {
      responseType: 'arraybuffer'
    })
    expect(res.status).toBe(200)
  })

  test('user with grant can create and list read keys', async () => {
    const ax = await axiosAuth('test1-admin1', { org: 'test1' })
    const createRes = await ax.post('/api/v1/api-keys', {
      type: 'read',
      name: 'my-read-key',
      owner: { type: 'organization', id: 'test1' }
    })
    expect(createRes.status).toBe(201)
    expect(createRes.data.key).toBeTruthy()

    const listRes = await ax.get('/api/v1/api-keys')
    expect(listRes.data.count).toBe(1)
    expect(listRes.data.results[0].name).toBe('my-read-key')
    expect(listRes.data.results[0].type).toBe('read')
  })

  test('user with grant can delete own read key', async () => {
    const ax = await axiosAuth('test1-admin1', { org: 'test1' })
    const createRes = await ax.post('/api/v1/api-keys', {
      type: 'read',
      name: 'to-delete',
      owner: { type: 'organization', id: 'test1' }
    })

    const deleteRes = await ax.delete(`/api/v1/api-keys/${createRes.data._id}`)
    expect(deleteRes.status).toBe(204)

    const listRes = await ax.get('/api/v1/api-keys')
    expect(listRes.data.count).toBe(0)
  })
})
