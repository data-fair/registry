// Exercises the mirror path against a *real* upstream registry (the `api-upstream`
// process). Nothing else in the suite executes syncNpmArtefact / syncFileArtefact:
// the other sync specs either mirror zero artefacts or assert a DNS failure.
//
// Requires DEV_UPSTREAM_API_PORT and a running upstream — see
// docs/superpowers/specs/2026-07-10-federation-dev-testing-design.md

import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import {
  superAdmin, clean,
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

const registerMirror = async (readKey: string, artefactIds: string[]) => {
  const admin = await superAdmin
  await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })
  for (const artefactId of artefactIds) {
    await admin.post(
      `/api/v1/remote-registries/${encodeURIComponent(upstreamBaseURL())}/selected-artefacts`,
      { artefactId }
    )
  }
}

// Triggers a sync and waits for it to settle. `previousLastSyncAt` distinguishes a
// fresh completion from the previous one — a bare `lastSyncStatus` check would
// return instantly on the second sync within a test.
const runSync = async (previousLastSyncAt?: string) => {
  const admin = await superAdmin
  const id = encodeURIComponent(upstreamBaseURL())
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
    const first = await runSync()
    const before = await getLocal(NPM_ID)

    await runSync(first.lastSyncAt)
    const after = await getLocal(NPM_ID)

    // the dataUpdatedAt fast path in syncNpmArtefact short-circuits
    expect(after.dataUpdatedAt).toBe(before.dataUpdatedAt)
    expect(after.path).toBe(before.path)
  })

  test('an upstream republish is picked up on the next sync', async () => {
    await registerMirror(readKey, [NPM_ID])
    const first = await runSync()
    const before = await getLocal(NPM_ID)

    const upload = upstreamAxiosWithApiKey(uploadKey)
    const tarball = await createTestTarball({ name: '@up/pkg', version: '2.0.0', licence: 'MIT' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    form.append('category', 'processing')
    await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent(NPM_ID), form, { headers: form.getHeaders() })

    await runSync(first.lastSyncAt)
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
})
