import { test, expect } from '@playwright/test'
import { superAdmin, axiosAuth, clean } from './support/axios.ts'

test.describe('API Keys', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('superadmin can create an upload API key', async () => {
    const ax = await superAdmin
    const res = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'CI pipeline'
    })
    expect(res.status).toBe(201)
    expect(res.data.key).toBeTruthy()
    expect(res.data.name).toBe('CI pipeline')
    expect(res.data.type).toBe('upload')
    expect(res.data.hashedKey).toBeUndefined()
  })

  test('superadmin can list API keys without hashedKey', async () => {
    const ax = await superAdmin
    await ax.post('/api/v1/api-keys', { type: 'upload', name: 'key1' })
    await ax.post('/api/v1/api-keys', { type: 'upload', name: 'key2' })

    const res = await ax.get('/api/v1/api-keys')
    expect(res.data.results).toHaveLength(2)
    for (const key of res.data.results) {
      expect(key.hashedKey).toBeUndefined()
    }
  })

  test('superadmin can revoke an API key', async () => {
    const ax = await superAdmin
    const created = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'to-delete' })

    const deleteRes = await ax.delete(`/api/v1/api-keys/${created.data._id}`)
    expect(deleteRes.status).toBe(204)

    const listRes = await ax.get('/api/v1/api-keys')
    expect(listRes.data.results).toHaveLength(0)
  })

  test('non-admin cannot create upload keys', async () => {
    const ax = await axiosAuth('dev-standalone1')
    try {
      await ax.post('/api/v1/api-keys', { type: 'upload', name: 'nope' })
      expect(true).toBe(false) // should not reach
    } catch (err: any) {
      expect(err.status).toBe(403)
    }
  })
})
