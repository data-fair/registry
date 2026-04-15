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

  test('superadmin can create an upload key with allowedName scope', async () => {
    const ax = await superAdmin
    const res = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'scoped',
      allowedName: 'terrain-france'
    })
    expect(res.status).toBe(201)
    expect(res.data.allowedName).toBe('terrain-france')
  })

  test('rejects allowedName on read keys', async () => {
    const ax = await superAdmin
    try {
      await ax.post('/api/v1/api-keys', {
        type: 'read',
        name: 'bad',
        owner: { type: 'organization', id: 'test1' },
        allowedName: 'anything'
      })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(400)
    }
  })

  test('superadmin can create an upload key with allowedCategory', async () => {
    const ax = await superAdmin
    const res = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'tileset-only',
      allowedCategory: 'tileset'
    })
    expect(res.status).toBe(201)
    expect(res.data.allowedCategory).toBe('tileset')
  })

  test('rejects invalid allowedCategory', async () => {
    const ax = await superAdmin
    try {
      await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'bad',
        allowedCategory: 'not-a-category'
      })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(400)
    }
  })

  test('rejects allowedCategory on read keys', async () => {
    const ax = await superAdmin
    try {
      await ax.post('/api/v1/api-keys', {
        type: 'read',
        name: 'bad',
        owner: { type: 'organization', id: 'test1' },
        allowedCategory: 'tileset'
      })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(400)
    }
  })

  test('list filter ?type=upload', async () => {
    const ax = await superAdmin
    await ax.post('/api/v1/api-keys', { type: 'upload', name: 'up1' })
    await ax.post('/api/v1/api-keys', { type: 'read', name: 'rd1', owner: { type: 'organization', id: 'test1' } })

    const res = await ax.get('/api/v1/api-keys?type=upload')
    expect(res.data.results).toHaveLength(1)
    expect(res.data.results[0].type).toBe('upload')
  })
})
