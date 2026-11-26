import { test, expect } from '@playwright/test'
import { superAdmin, anonymousAx, axiosAuth, clean } from './support/axios.ts'

test.describe('Access Grants /me', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('returns 401 for anonymous', async () => {
    try {
      await anonymousAx.get('/api/v1/access-grants/me')
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(401)
    }
  })

  test('returns 404 when user has no grant', async () => {
    const ax = await axiosAuth('test_registry_standalone1')
    try {
      await ax.get('/api/v1/access-grants/me')
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  test('returns grant when user has one (user type)', async () => {
    const admin = await superAdmin
    await admin.post('/api/v1/access-grants', { account: { type: 'user', id: 'test_registry_standalone1' } })

    const ax = await axiosAuth('test_registry_standalone1')
    const res = await ax.get('/api/v1/access-grants/me')
    expect(res.status).toBe(200)
    expect(res.data.account.type).toBe('user')
    expect(res.data.account.id).toBe('test_registry_standalone1')
  })

  test('returns grant for org member (org type)', async () => {
    const admin = await superAdmin
    await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test_registry_org1' } })

    const ax = await axiosAuth('test_registry_org1_admin', { org: 'test_registry_org1' })
    const res = await ax.get('/api/v1/access-grants/me')
    expect(res.status).toBe(200)
    expect(res.data.account.type).toBe('organization')
    expect(res.data.account.id).toBe('test_registry_org1')
  })
})
