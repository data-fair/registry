import { test, expect } from '@playwright/test'
import { superAdmin, axiosAuth, clean } from './support/axios.ts'

test.describe('Access Grants', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('superadmin can grant access', async () => {
    const ax = await superAdmin
    const res = await ax.post('/api/v1/access-grants', {
      account: { type: 'organization', id: 'test1' }
    })
    expect(res.status).toBe(201)
    expect(res.data.account.id).toBe('test1')
    expect(res.data.grantedBy).toBeTruthy()
    expect(res.data.grantedAt).toBeTruthy()
  })

  test('superadmin can list grants', async () => {
    const ax = await superAdmin
    await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    await ax.post('/api/v1/access-grants', { account: { type: 'user', id: 'user1' } })

    const res = await ax.get('/api/v1/access-grants')
    expect(res.data.results).toHaveLength(2)
  })

  test('superadmin can revoke a grant', async () => {
    const ax = await superAdmin
    const created = await ax.post('/api/v1/access-grants', {
      account: { type: 'organization', id: 'test1' }
    })
    const deleteRes = await ax.delete(`/api/v1/access-grants/${created.data._id}`)
    expect(deleteRes.status).toBe(204)

    const listRes = await ax.get('/api/v1/access-grants')
    expect(listRes.data.results).toHaveLength(0)
  })

  test('duplicate grant returns 409', async () => {
    const ax = await superAdmin
    await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    try {
      await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(409)
    }
  })

  test('non-admin cannot grant access', async () => {
    const ax = await axiosAuth('dev-standalone1')
    try {
      await ax.post('/api/v1/access-grants', { account: { type: 'user', id: 'someone' } })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(403)
    }
  })
})
