import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosAuth, axiosWithApiKey, clean, setArtefactOrigin, holdSyncLock, releaseSyncLock } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

let uploadApiKey: string

test.describe('Remote registries', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'ci' })
    uploadApiKey = keyRes.data.key
  })

  test.describe('CRUD', () => {
    test('create remote registry', async () => {
      const ax = await superAdmin
      const res = await ax.post('/api/v1/remote-registries', {
        url: 'https://upstream.example.com',
        name: 'Upstream',
        apiKey: 'reg_abc_secretkey123'
      })
      expect(res.status).toBe(201)
      expect(res.data._id).toBe('https://upstream.example.com')
      expect(res.data.name).toBe('Upstream')
      expect(res.data.apiKeyShortId).toBe('reg_abc')
      expect(res.data.apiKey).toBeUndefined()
      expect(res.data.selectedArtefacts).toEqual([])
    })

    test('duplicate URL returns 409', async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', {
        url: 'https://upstream.example.com',
        name: 'Upstream',
        apiKey: 'reg_abc_secretkey123'
      })
      try {
        await ax.post('/api/v1/remote-registries', {
          url: 'https://upstream.example.com',
          name: 'Duplicate',
          apiKey: 'reg_def_otherkey'
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })

    test('list remote registries excludes apiKey', async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', {
        url: 'https://upstream1.example.com',
        name: 'Upstream 1',
        apiKey: 'reg_a_key1'
      })
      await ax.post('/api/v1/remote-registries', {
        url: 'https://upstream2.example.com',
        name: 'Upstream 2',
        apiKey: 'reg_b_key2'
      })

      const res = await ax.get('/api/v1/remote-registries')
      expect(res.data.count).toBe(2)
      for (const r of res.data.results) {
        expect(r.apiKey).toBeUndefined()
        expect(r.apiKeyShortId).toBeTruthy()
      }
    })

    test('get single registry excludes apiKey', async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', {
        url: 'https://upstream.example.com',
        name: 'Upstream',
        apiKey: 'reg_abc_secretkey123'
      })

      const res = await ax.get('/api/v1/remote-registries/' + encodeURIComponent('https://upstream.example.com'))
      expect(res.data.name).toBe('Upstream')
      expect(res.data.apiKey).toBeUndefined()
      expect(res.data.apiKeyShortId).toBe('reg_abc')
    })

    test('update registry name and apiKey', async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', {
        url: 'https://upstream.example.com',
        name: 'Old Name',
        apiKey: 'reg_old_key123'
      })

      const res = await ax.patch(
        '/api/v1/remote-registries/' + encodeURIComponent('https://upstream.example.com'),
        { name: 'New Name', apiKey: 'reg_new_key456' }
      )
      expect(res.data.name).toBe('New Name')
      expect(res.data.apiKeyShortId).toBe('reg_new')
      expect(res.data.apiKey).toBeUndefined()
    })

    test('delete registry', async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', {
        url: 'https://upstream.example.com',
        name: 'Upstream',
        apiKey: 'reg_abc_key'
      })

      const delRes = await ax.delete('/api/v1/remote-registries/' + encodeURIComponent('https://upstream.example.com'))
      expect(delRes.status).toBe(204)

      const list = await ax.get('/api/v1/remote-registries')
      expect(list.data.count).toBe(0)
    })

    test('delete registry unlocks mirrored artefacts', async () => {
      const ax = await superAdmin
      const remoteUrl = 'https://upstream.example.com'

      // Upload an artefact, then simulate it being mirrored by setting origin
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })

      // Create remote registry
      await ax.post('/api/v1/remote-registries', { url: remoteUrl, name: 'Upstream', apiKey: 'reg_abc_key' })

      // Set origin on the artefact (simulates a sync having occurred)
      await setArtefactOrigin('@test/pkg@1', remoteUrl)

      // Verify origin is set
      const before = await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'))
      expect(before.data.origin).toBe(remoteUrl)

      // Delete the remote registry
      await ax.delete('/api/v1/remote-registries/' + encodeURIComponent(remoteUrl))

      // Origin should be removed
      const after = await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'))
      expect(after.data.origin).toBeUndefined()
    })

    test('non-admin cannot access remote registries', async () => {
      const ax = await axiosAuth('dev-standalone1')
      try {
        await ax.get('/api/v1/remote-registries')
        expect(true).toBe(false)
      } catch (err: any) {
        expect([401, 403]).toContain(err.status)
      }
      try {
        await ax.post('/api/v1/remote-registries', { url: 'https://x.com', name: 'X', apiKey: 'k' })
        expect(true).toBe(false)
      } catch (err: any) {
        expect([401, 403]).toContain(err.status)
      }
    })
  })

  test.describe('Selected artefacts', () => {
    const remoteUrl = 'https://upstream.example.com'
    const encodedRemoteUrl = encodeURIComponent(remoteUrl)

    test.beforeEach(async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', { url: remoteUrl, name: 'Upstream', apiKey: 'reg_abc_key' })
    })

    test('select artefact', async () => {
      const ax = await superAdmin
      const res = await ax.post(`/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts`, {
        artefactId: '@test/pkg'
      })
      expect(res.status).toBe(201)

      const registry = await ax.get(`/api/v1/remote-registries/${encodedRemoteUrl}`)
      expect(registry.data.selectedArtefacts).toContain('@test/pkg')
    })

    test('select duplicate returns 409', async () => {
      const ax = await superAdmin
      await ax.post(`/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts`, {
        artefactId: '@test/pkg'
      })
      try {
        await ax.post(`/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts`, {
          artefactId: '@test/pkg'
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })

    test('select conflicts with existing local artefact', async () => {
      const ax = await superAdmin

      // Upload a local artefact
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })

      // Try to select the same artefact ID from remote
      try {
        await ax.post(`/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts`, {
          artefactId: '@test/pkg@1'
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })

    test('unselect artefact', async () => {
      const ax = await superAdmin
      await ax.post(`/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts`, {
        artefactId: '@test/pkg'
      })

      const res = await ax.delete(
        `/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts/${encodeURIComponent('@test/pkg')}`
      )
      expect(res.status).toBe(204)

      const registry = await ax.get(`/api/v1/remote-registries/${encodedRemoteUrl}`)
      expect(registry.data.selectedArtefacts).not.toContain('@test/pkg')
    })

    test('unselect removes origin from local artefact', async () => {
      const ax = await superAdmin

      // Upload an artefact and set origin to simulate a synced state
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })
      await setArtefactOrigin('@test/pkg@1', remoteUrl)

      // Select then unselect
      await ax.post(`/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts`, {
        artefactId: '@test/pkg@1'
      })
      await ax.delete(
        `/api/v1/remote-registries/${encodedRemoteUrl}/selected-artefacts/${encodeURIComponent('@test/pkg@1')}`
      )

      const artefact = await ax.get('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'))
      expect(artefact.data.origin).toBeUndefined()
    })
  })

  test.describe('Integration protections', () => {
    test.beforeEach(async () => {
      // Upload an artefact and set origin to simulate a mirrored artefact
      const tarball = await createTestTarball({ name: '@test/mirrored', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/mirrored@1'), form, { headers: form.getHeaders() })
      await setArtefactOrigin('@test/mirrored@1', 'https://upstream.example.com')
    })

    test('upload to mirrored npm artefact returns 409', async () => {
      const tarball = await createTestTarball({ name: '@test/mirrored', version: '1.1.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      try {
        await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/mirrored@1'), form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })

    test('delete mirrored artefact returns 403', async () => {
      const ax = await superAdmin
      try {
        await ax.delete('/api/v1/artefacts/' + encodeURIComponent('@test/mirrored@1'))
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('PATCH mirrored artefact allows only public and privateAccess', async () => {
      const ax = await superAdmin

      // Allowed: public and privateAccess
      const okRes = await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/mirrored@1'), {
        public: true,
        privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }]
      })
      expect(okRes.data.public).toBe(true)

      // Forbidden: title on mirrored artefact
      try {
        await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/mirrored@1'), {
          title: { fr: 'Interdit', en: 'Forbidden' }
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('upload to mirrored file artefact returns 409', async () => {
      // Upload a file artefact and set origin
      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/file/mirrored-file', fileForm, { headers: fileForm.getHeaders() })
      await setArtefactOrigin('mirrored-file', 'https://upstream.example.com')

      // Try uploading again
      const form2 = new FormData()
      form2.append('file', Buffer.from('new-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form2.append('category', 'tileset')
      try {
        await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/file/mirrored-file', form2, { headers: form2.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      }
    })
  })

  test.describe('Sync state on reads', () => {
    const url = 'https://upstream.example.com'

    test.beforeEach(async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', { url, name: 'Upstream', apiKey: 'reg_abc_secretkey123' })
    })

    test('a registry with no attempt recorded is idle', async () => {
      const ax = await superAdmin
      const res = await ax.get('/api/v1/remote-registries/' + encodeURIComponent(url))
      expect(res.data.syncState).toBe('idle')
    })

    test('a held lock reports running on the detail endpoint', async () => {
      const ax = await superAdmin
      await holdSyncLock(url)
      try {
        const res = await ax.get('/api/v1/remote-registries/' + encodeURIComponent(url))
        expect(res.data.syncState).toBe('running')
      } finally {
        await releaseSyncLock(url)
      }
      const after = await ax.get('/api/v1/remote-registries/' + encodeURIComponent(url))
      expect(after.data.syncState).toBe('idle')
    })

    test('a held lock reports running on the list endpoint', async () => {
      const ax = await superAdmin
      await holdSyncLock(url)
      try {
        const res = await ax.get('/api/v1/remote-registries')
        expect(res.data.results.find((r: any) => r._id === url).syncState).toBe('running')
      } finally {
        await releaseSyncLock(url)
      }
    })

    test('one registry running does not mark its siblings as running', async () => {
      const ax = await superAdmin
      const other = 'https://other.example.com'
      await ax.post('/api/v1/remote-registries', { url: other, name: 'Other', apiKey: 'reg_def_otherkey' })
      await holdSyncLock(url)
      try {
        const res = await ax.get('/api/v1/remote-registries')
        const byId = Object.fromEntries(res.data.results.map((r: any) => [r._id, r.syncState]))
        expect(byId[url]).toBe('running')
        expect(byId[other]).toBe('idle')
      } finally {
        await releaseSyncLock(url)
      }
    })
  })

  test.describe('Manual sync trigger', () => {
    const url = 'https://upstream.example.com'

    test.beforeEach(async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', { url, name: 'Upstream', apiKey: 'reg_abc_secretkey123' })
    })

    test('a free lock accepts the sync with 202', async () => {
      const ax = await superAdmin
      const res = await ax.post('/api/v1/remote-registries/' + encodeURIComponent(url) + '/sync')
      expect(res.status).toBe(202)
    })

    test('a held lock rejects the sync with 409', async () => {
      const ax = await superAdmin
      await holdSyncLock(url)
      try {
        await ax.post('/api/v1/remote-registries/' + encodeURIComponent(url) + '/sync')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      } finally {
        await releaseSyncLock(url)
      }
    })

    test('an unknown registry is still 404, not 409', async () => {
      const ax = await superAdmin
      try {
        await ax.post('/api/v1/remote-registries/' + encodeURIComponent('https://nope.example.com') + '/sync')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })
  })
})
