import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosAuth, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

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
    expect(res.data.key).toMatch(/^reg_[a-zA-Z0-9_-]{8}_[0-9a-f]{64}$/)
    expect(res.data.shortId).toBeTruthy()
    expect(res.data.shortId).toHaveLength(8)
    expect(res.data.name).toBe('CI pipeline')
    expect(res.data.type).toBe('upload')
    expect(res.data.hashedKey).toBeUndefined()
  })

  test('list API keys without hashedKey', async () => {
    const ax = await superAdmin
    await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    const orgAx = await axiosAuth('test1-admin1', { org: 'test1' })
    await orgAx.post('/api/v1/api-keys', { type: 'read', name: 'key1', owner: { type: 'organization', id: 'test1' } })
    await orgAx.post('/api/v1/api-keys', { type: 'read', name: 'key2', owner: { type: 'organization', id: 'test1' } })

    const res = await orgAx.get('/api/v1/api-keys')
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

  test('superadmin can create an upload key with allowedNamePrefix scope', async () => {
    const ax = await superAdmin
    const res = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'scoped',
      allowedNamePrefix: '@data-fair/'
    })
    expect(res.status).toBe(201)
    expect(res.data.allowedNamePrefix).toBe('@data-fair/')
  })

  test('rejects allowedNamePrefix on read keys', async () => {
    const ax = await superAdmin
    try {
      await ax.post('/api/v1/api-keys', {
        type: 'read',
        name: 'bad',
        owner: { type: 'organization', id: 'test1' },
        allowedNamePrefix: 'anything'
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

  test('list filter ?type=read', async () => {
    const ax = await superAdmin
    await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    const orgAx = await axiosAuth('test1-admin1', { org: 'test1' })
    await orgAx.post('/api/v1/api-keys', { type: 'read', name: 'rd1', owner: { type: 'organization', id: 'test1' } })
    await orgAx.post('/api/v1/api-keys', { type: 'read', name: 'rd2', owner: { type: 'organization', id: 'test1' } })

    const all = await orgAx.get('/api/v1/api-keys')
    expect(all.data.results).toHaveLength(2)

    const filtered = await orgAx.get('/api/v1/api-keys?type=read')
    expect(filtered.data.results).toHaveLength(2)
    for (const key of filtered.data.results) {
      expect(key.type).toBe('read')
    }
  })

  test('shortId visible in key list', async () => {
    const ax = await superAdmin
    await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    const orgAx = await axiosAuth('test1-admin1', { org: 'test1' })
    await orgAx.post('/api/v1/api-keys', { type: 'read', name: 'key1', owner: { type: 'organization', id: 'test1' } })
    const res = await orgAx.get('/api/v1/api-keys')
    expect(res.data.results[0].shortId).toBeTruthy()
    expect(res.data.results[0].shortId).toHaveLength(8)
  })

  test('expired key is rejected on authentication', async () => {
    const ax = await superAdmin
    const past = new Date(Date.now() - 1000).toISOString()
    const keyRes = await ax.post('/api/v1/api-keys', {
      type: 'upload',
      name: 'expired-key',
      expiresAt: past
    })
    const upload = axiosWithApiKey(keyRes.data.key)

    const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    try {
      await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(401)
    }
  })

  test('lastUsedAt updated after key usage', async () => {
    const ax = await superAdmin

    // Upload a public artefact so the read key can access it
    const uploadKeyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'uploader' })
    const upload = axiosWithApiKey(uploadKeyRes.data.key)
    const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })
    await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { public: true, privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }] })

    // Create a read key and use it
    await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    const orgAx = await axiosAuth('test1-admin1', { org: 'test1' })
    const readKeyRes = await orgAx.post('/api/v1/api-keys', { type: 'read', name: 'tracked-key', owner: { type: 'organization', id: 'test1' } })
    const reader = axiosWithApiKey(readKeyRes.data.key)
    await reader.get('/api/v1/artefacts')

    // Small delay for the fire-and-forget update
    await new Promise(resolve => setTimeout(resolve, 200))

    const listRes = await orgAx.get('/api/v1/api-keys')
    const key = listRes.data.results.find((k: any) => k.name === 'tracked-key')
    expect(key.lastUsedAt).toBeTruthy()
    const lastUsed = new Date(key.lastUsedAt).getTime()
    expect(Date.now() - lastUsed).toBeLessThan(5000)
  })

  test.describe('allowedNamePrefix scoping', () => {
    test('npm upload accepted when artefact id starts with the prefix', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'prefix-scoped',
        allowedNamePrefix: '@data-fair/processing-'
      })
      const upload = axiosWithApiKey(keyRes.data.key)
      const tarball = await createTestTarball({ name: '@data-fair/processing-gpkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      const res = await upload.post(
        '/api/v1/artefacts/npm/' + encodeURIComponent('@data-fair/processing-gpkg@1'),
        form,
        { headers: form.getHeaders() }
      )
      expect(res.status).toBe(201)
    })

    test('npm upload rejected when artefact id does not start with the prefix', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'prefix-scoped',
        allowedNamePrefix: '@data-fair/processing-'
      })
      const upload = axiosWithApiKey(keyRes.data.key)
      const tarball = await createTestTarball({ name: '@data-fair/catalog-x', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      try {
        await upload.post(
          '/api/v1/artefacts/npm/' + encodeURIComponent('@data-fair/catalog-x@1'),
          form,
          { headers: form.getHeaders() }
        )
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('file upload accepted when artefact name starts with the prefix', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'prefix-scoped',
        allowedNamePrefix: 'terrain-'
      })
      const upload = axiosWithApiKey(keyRes.data.key)
      const form = new FormData()
      form.append('file', Buffer.from('hello'), { filename: 'data.bin', contentType: 'application/octet-stream' })
      const res = await upload.post(
        '/api/v1/artefacts/file/' + encodeURIComponent('terrain-france'),
        form,
        { headers: form.getHeaders() }
      )
      expect(res.status).toBe(201)
    })

    test('file upload rejected when artefact name does not start with the prefix', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'prefix-scoped',
        allowedNamePrefix: 'terrain-'
      })
      const upload = axiosWithApiKey(keyRes.data.key)
      const form = new FormData()
      form.append('file', Buffer.from('hello'), { filename: 'data.bin', contentType: 'application/octet-stream' })
      try {
        await upload.post(
          '/api/v1/artefacts/file/' + encodeURIComponent('roads-france'),
          form,
          { headers: form.getHeaders() }
        )
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })
  })

  test.describe('read key owner permissions', () => {
    test.beforeEach(async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    })

    test('org admin can create a read key for their organization and the owner name is stored', async () => {
      const orgAx = await axiosAuth('test1-admin1', { org: 'test1' })
      const res = await orgAx.post('/api/v1/api-keys', {
        type: 'read',
        name: 'federation-key',
        owner: { type: 'organization', id: 'test1', name: 'Test Organization 1' }
      })
      expect(res.status).toBe(201)
      expect(res.data.owner.name).toBe('Test Organization 1')
    })

    test('non-admin org member cannot create a read key', async () => {
      const orgAx = await axiosAuth('test1-contrib1', { org: 'test1' })
      try {
        await orgAx.post('/api/v1/api-keys', {
          type: 'read',
          name: 'nope',
          owner: { type: 'organization', id: 'test1' }
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('a user cannot create a read key for an organization they do not administer', async () => {
      const ax = await axiosAuth('dev-standalone1')
      try {
        await ax.post('/api/v1/api-keys', {
          type: 'read',
          name: 'nope',
          owner: { type: 'organization', id: 'test1' }
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('org admin can revoke their organization read key', async () => {
      const orgAx = await axiosAuth('test1-admin1', { org: 'test1' })
      const created = await orgAx.post('/api/v1/api-keys', {
        type: 'read',
        name: 'federation-key',
        owner: { type: 'organization', id: 'test1' }
      })
      const del = await orgAx.delete(`/api/v1/api-keys/${created.data._id}`)
      expect(del.status).toBe(204)
    })

    test('non-admin org member cannot revoke an organization read key', async () => {
      const orgAdmin = await axiosAuth('test1-admin1', { org: 'test1' })
      const created = await orgAdmin.post('/api/v1/api-keys', {
        type: 'read',
        name: 'federation-key',
        owner: { type: 'organization', id: 'test1' }
      })
      const contrib = await axiosAuth('test1-contrib1', { org: 'test1' })
      try {
        await contrib.delete(`/api/v1/api-keys/${created.data._id}`)
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })
  })
})
