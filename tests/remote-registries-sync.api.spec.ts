// Exercises the mirror path against a *real* upstream registry (the `api-upstream`
// process). Nothing else in the suite executes syncNpmArtefact / syncFileArtefact:
// the other sync specs either mirror zero artefacts or assert a DNS failure.
//
// Requires DEV_UPSTREAM_API_PORT and a running upstream — see
// docs/superpowers/specs/2026-07-10-federation-dev-testing-design.md

import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import sharp from 'sharp'
import {
  superAdmin, clean, waitSyncIdle,
  upstreamBaseURL, upstreamSuperAdmin, upstreamAxiosAuth, upstreamAxiosWithApiKey, cleanUpstream
} from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

const NPM_ID = '@up/pkg@1'
const FILE_ID = 'up-terrain'
const FILE_BYTES = 'upstream-tileset-bytes'

// Seeds the upstream and returns a read key owned by org test1. A read key needs
// (a) an admin of the owner account and (b) an existing access grant for it.
const seedUpstream = async () => {
  const admin = await upstreamSuperAdmin()
  const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'up-ci' })
  const upload = upstreamAxiosWithApiKey(keyRes.data.key)

  const tarball = await createTestTarball({ name: '@up/pkg', version: '1.0.0', licence: 'MIT' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  form.append('category', 'processing')
  await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent(NPM_ID), form, { headers: form.getHeaders() })
  await admin.patch('/api/v1/artefacts/' + encodeURIComponent(NPM_ID), { public: true })

  const fileForm = new FormData()
  fileForm.append('file', Buffer.from(FILE_BYTES), { filename: 'up.mbtiles', contentType: 'application/octet-stream' })
  fileForm.append('category', 'tileset')
  await upload.post('/api/v1/artefacts/file/' + FILE_ID, fileForm, { headers: fileForm.getHeaders() })
  await admin.patch('/api/v1/artefacts/' + FILE_ID, { public: true })

  await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
  const orgAdmin = await upstreamAxiosAuth('test1-admin1', { org: 'test1' })
  const readRes = await orgAdmin.post('/api/v1/api-keys', {
    type: 'read',
    name: 'federation',
    owner: { type: 'organization', id: 'test1' }
  })
  return { readKey: readRes.data.key as string, uploadKey: keyRes.data.key as string }
}

const selectArtefact = async (artefactId: string) => {
  const admin = await superAdmin
  await admin.post(
    `/api/v1/remote-registries/${encodeURIComponent(upstreamBaseURL())}/selected-artefacts`,
    { artefactId }
  )
}

// Selecting kicks off a background sync of that artefact; wait for it so the
// tests below start from a settled registry.
const registerMirror = async (readKey: string, artefactIds: string[]) => {
  const admin = await superAdmin
  await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })
  for (const artefactId of artefactIds) await selectArtefact(artefactId)
  await waitSyncIdle(upstreamBaseURL())
}

const republishUpstream = async (uploadKey: string, version: string) => {
  const upload = upstreamAxiosWithApiKey(uploadKey)
  const tarball = await createTestTarball({ name: '@up/pkg', version, licence: 'MIT' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  form.append('category', 'processing')
  await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent(NPM_ID), form, { headers: form.getHeaders() })
}

const uploadUpstreamThumbnail = async (artefactId: string) => {
  const admin = await upstreamSuperAdmin()
  const png = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 10, g: 120, b: 200 } } }).png().toBuffer()
  const form = new FormData()
  form.append('file', png, { filename: 'thumb.png', contentType: 'image/png' })
  const res = await admin.post(`/api/v1/artefacts/${encodeURIComponent(artefactId)}/thumbnail`, form, { headers: form.getHeaders() })
  return res.data.thumbnail as { id: string, width: number, height: number }
}

const listRemote = async (params: Record<string, string> = {}) => {
  const admin = await superAdmin
  const res = await admin.get(`/api/v1/remote-registries/${encodeURIComponent(upstreamBaseURL())}/remote-artefacts`, { params })
  return res.data as { results: any[], count: number }
}

// Triggers a full sync and waits for it to settle. The completion is told apart
// from the previous one (a selection's auto-sync, or an earlier runSync) by a
// fresh lastSyncAt — a bare `lastSyncStatus` check would return instantly.
const runSync = async () => {
  const admin = await superAdmin
  const id = encodeURIComponent(upstreamBaseURL())
  const before = await admin.get(`/api/v1/remote-registries/${id}`)
  const previousLastSyncAt = before.data.lastSyncAt
  await admin.post(`/api/v1/remote-registries/${id}/sync`)
  for (let i = 0; i < 100; i++) {
    const res = await admin.get(`/api/v1/remote-registries/${id}`)
    if (res.data.lastSyncStatus && res.data.lastSyncAt !== previousLastSyncAt) return res.data
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('sync did not settle within 10s')
}

const getLocal = async (id: string) => {
  const admin = await superAdmin
  const res = await admin.get('/api/v1/artefacts/' + encodeURIComponent(id))
  return res.data
}

const download = async (ax: any, id: string) => {
  const res = await ax.get('/api/v1/artefacts/' + encodeURIComponent(id) + '/download', {
    responseType: 'arraybuffer',
    maxRedirects: 0,
    validateStatus: (s: number) => s === 200 || s === 302
  })
  return Buffer.from(res.data)
}

test.describe('Federation sync against a real upstream registry', () => {
  let readKey: string
  let uploadKey: string

  test.beforeEach(async () => {
    await clean()
    await cleanUpstream()
    const seeded = await seedUpstream()
    readKey = seeded.readKey
    uploadKey = seeded.uploadKey
  })

  test('mirrors a real npm artefact end to end', async () => {
    await registerMirror(readKey, [NPM_ID])
    const registry = await runSync()

    expect(registry.lastSyncStatus).toBe('success')
    expect(registry.lastSyncError).toBeUndefined()
    expect(registry.syncProgress.total).toBe(1)
    expect(registry.syncProgress.done).toBe(1)
    expect(registry.syncState).toBe('idle')

    const local = await getLocal(NPM_ID)
    expect(local.origin).toBe(upstreamBaseURL())
    expect(local.format).toBe('npm')
    expect(local.packageName).toBe('@up/pkg')
    expect(local.version).toBe('1.0.0')
    expect(typeof local.path).toBe('string')
    expect(local.size).toBeGreaterThan(0)
    expect(local.hasNativeModules).toBe(false)
  })

  test('the mirrored tarball is byte-identical to the upstream one', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()

    const upstreamAdmin = await upstreamSuperAdmin()
    const downstreamAdmin = await superAdmin
    const upstreamBytes = await download(upstreamAdmin, NPM_ID)
    const localBytes = await download(downstreamAdmin, NPM_ID)

    expect(localBytes.length).toBe(upstreamBytes.length)
    expect(localBytes.equals(upstreamBytes)).toBe(true)
  })

  test('a re-sync with no upstream change does not re-download', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()
    const before = await getLocal(NPM_ID)

    await runSync()
    const after = await getLocal(NPM_ID)

    // the dataUpdatedAt fast path in syncNpmArtefact short-circuits
    expect(after.dataUpdatedAt).toBe(before.dataUpdatedAt)
    expect(after.path).toBe(before.path)
  })

  test('an upstream republish is picked up on the next sync', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()
    const before = await getLocal(NPM_ID)

    await republishUpstream(uploadKey, '2.0.0')

    await runSync()
    const after = await getLocal(NPM_ID)

    expect(after.version).toBe('2.0.0')
    expect(after.path).not.toBe(before.path)
    expect(after.dataUpdatedAt).not.toBe(before.dataUpdatedAt)
  })

  test('a file artefact mirrors too, with its bytes', async () => {
    await registerMirror(readKey, [FILE_ID])
    const registry = await runSync()
    expect(registry.lastSyncStatus).toBe('success')

    const local = await getLocal(FILE_ID)
    expect(local.origin).toBe(upstreamBaseURL())
    expect(local.format).toBe('file')

    const admin = await superAdmin
    const bytes = await download(admin, FILE_ID)
    expect(bytes.toString()).toBe(FILE_BYTES)
  })

  test('a genuinely mirrored artefact rejects remote-owned edits but allows local access edits', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()
    const admin = await superAdmin
    const id = encodeURIComponent(NPM_ID)

    try {
      await admin.patch('/api/v1/artefacts/' + id, { title: { en: 'nope' } })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(403)
    }

    try {
      await admin.delete('/api/v1/artefacts/' + id)
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(403)
    }

    const res = await admin.patch('/api/v1/artefacts/' + id, { public: true })
    expect(res.data.public).toBe(true)
  })

  test('unselecting a mirrored artefact clears its origin', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()
    const admin = await superAdmin

    await admin.delete(
      `/api/v1/remote-registries/${encodeURIComponent(upstreamBaseURL())}/selected-artefacts/${encodeURIComponent(NPM_ID)}`
    )

    const local = await getLocal(NPM_ID)
    expect(local.origin).toBeUndefined()
  })

  test('selecting an artefact mirrors it without a manual sync', async () => {
    const admin = await superAdmin
    await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })
    await selectArtefact(NPM_ID)
    const registry = await waitSyncIdle(upstreamBaseURL())

    expect(registry.lastSyncStatus).toBe('success')
    const local = await getLocal(NPM_ID)
    expect(local.origin).toBe(upstreamBaseURL())
    expect(local.version).toBe('1.0.0')
  })

  test('selecting several artefacts in a row mirrors them all', async () => {
    const admin = await superAdmin
    await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })
    // no await between the two: the second lands while the first sync holds the lock
    await Promise.all([selectArtefact(NPM_ID), selectArtefact(FILE_ID)])
    const registry = await waitSyncIdle(upstreamBaseURL())

    expect(registry.lastSyncStatus).toBe('success')
    expect(registry.pendingSync ?? []).toEqual([])
    expect((await getLocal(NPM_ID)).origin).toBe(upstreamBaseURL())
    expect((await getLocal(FILE_ID)).origin).toBe(upstreamBaseURL())
  })

  test('the upstream thumbnail is mirrored under the same id', async () => {
    const upstreamThumb = await uploadUpstreamThumbnail(NPM_ID)
    await registerMirror(readKey, [NPM_ID])

    const local = await getLocal(NPM_ID)
    expect(local.thumbnail).toEqual(upstreamThumb)

    const admin = await superAdmin
    const res = await admin.get(`/api/v1/thumbnails/${upstreamThumb.id}/data`, { responseType: 'arraybuffer' })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(Buffer.from(res.data).length).toBeGreaterThan(0)
  })

  test('an upstream thumbnail removal is mirrored on the next sync', async () => {
    const upstreamThumb = await uploadUpstreamThumbnail(NPM_ID)
    await registerMirror(readKey, [NPM_ID])
    await runSync()

    const upstreamAdmin = await upstreamSuperAdmin()
    await upstreamAdmin.delete(`/api/v1/artefacts/${encodeURIComponent(NPM_ID)}/thumbnail`)
    await runSync()

    const local = await getLocal(NPM_ID)
    expect(local.thumbnail).toBeUndefined()
    const admin = await superAdmin
    try {
      await admin.get(`/api/v1/thumbnails/${upstreamThumb.id}/data`)
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  test('remote-artefacts reports the local mirror state of each artefact', async () => {
    const admin = await superAdmin
    await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })

    const before = (await listRemote()).results.find(a => a._id === NPM_ID)
    expect(before.local).toEqual({ synced: false, upToDate: false })

    await selectArtefact(NPM_ID)
    await waitSyncIdle(upstreamBaseURL())
    const synced = (await listRemote()).results.find(a => a._id === NPM_ID)
    expect(synced.local.synced).toBe(true)
    expect(synced.local.upToDate).toBe(true)
    expect(synced.local.dataUpdatedAt).toBe(synced.dataUpdatedAt)

    await republishUpstream(uploadKey, '2.0.0')
    const stale = (await listRemote()).results.find(a => a._id === NPM_ID)
    expect(stale.local.synced).toBe(true)
    expect(stale.local.upToDate).toBe(false)
  })

  test('an upstream thumbnail is served through the local proxy for the admin table', async () => {
    const upstreamThumb = await uploadUpstreamThumbnail(NPM_ID)
    const admin = await superAdmin
    await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })

    const res = await admin.get(
      `/api/v1/remote-registries/${encodeURIComponent(upstreamBaseURL())}/remote-thumbnails/${upstreamThumb.id}/data`,
      { responseType: 'arraybuffer' }
    )
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-security-policy']).toContain('sandbox')
    expect(Buffer.from(res.data).length).toBeGreaterThan(0)
  })

  test('remote-artefacts forwards category and format filters to the upstream', async () => {
    const admin = await superAdmin
    await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })

    const tilesets = await listRemote({ category: 'tileset' })
    expect(tilesets.results.map(a => a._id)).toEqual([FILE_ID])

    const npm = await listRemote({ format: 'npm' })
    expect(npm.results.map(a => a._id)).toEqual([NPM_ID])
  })
})
