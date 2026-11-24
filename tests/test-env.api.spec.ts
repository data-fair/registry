import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { anonymousAx, axiosInternal, superAdmin } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

// the test API, reached directly: a request through nginx is not internal
const testEnv = `http://localhost:${process.env.DEV_API_PORT}/api/test-env`
const internal = axiosInternal('secret-registry-internal')

// two nested sub-spaces of this suite's own: the clean of one leaves the other alone
const a = 'test_registry_cleana_'
const b = 'test_registry_cleanb_'
// a global artefact of no sub-space (dev data, another service's plugin)
const unprefixed = 'zz-test-env-unprefixed'

const npmId = (p: string) => `@${p}/pkg@1`
const fileId = (p: string) => `${p}file`
const remoteUrl = (p: string) => `https://${p.replace(/_/g, '-')}.example.com`

// what a sub-space owns, as [collection, _id]: its artefacts (an npm one uploaded for real, so with a tarball,
// and a file one), their scan, thumbnail and scan lock, the api keys created by or owned by its accounts,
// the access grant of its organization, its remote registry and that registry's sync lock
const owned = (p: string): [string, string][] => [
  ['artefacts', npmId(p)],
  ['artefacts', fileId(p)],
  ['artefact-scans', npmId(p)],
  ['thumbnails', `${p}thumb`],
  ['locks', `scan-${npmId(p)}`],
  ['api-keys', `${p}created`],
  ['api-keys', `${p}owned`],
  ['access-grants', `${p}grant`],
  ['remote-registries', remoteUrl(p)],
  ['locks', `sync-remote-${remoteUrl(p)}`]
]

const upload = async (id: string, name: string) => {
  const form = new FormData()
  form.append('file', await createTestTarball({ name, version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
  await internal.post('/api/v1/artefacts/npm/' + encodeURIComponent(id), form, { headers: form.getHeaders() })
}

const seed = async (p: string) => {
  await upload(npmId(p), `@${p}/pkg`)
  await anonymousAx.put(`${testEnv}/artefacts/${encodeURIComponent(fileId(p))}/doc`, { format: 'file', category: 'other' })
  const doc = (collection: string, body: Record<string, unknown>) => anonymousAx.post(`${testEnv}/docs/${collection}`, body)
  const now = new Date().toISOString()
  await doc('artefact-scans', { _id: npmId(p), scannedAt: now, scannerVersion: 'test', vulnerabilities: [] })
  await doc('thumbnails', { _id: `${p}thumb`, artefactId: npmId(p), mimeType: 'image/webp', width: 1, height: 1, byteSize: 1, createdAt: now })
  await doc('locks', { _id: `scan-${npmId(p)}`, pid: 'test-env', createdAt: now, updatedAt: now })
  await doc('api-keys', { _id: `${p}created`, type: 'upload', name: 'k', hashedKey: `${p}h1`, shortId: `${p}s1`, createdBy: { type: 'user', id: `${p}user` }, createdAt: now })
  await doc('api-keys', { _id: `${p}owned`, type: 'read', name: 'k', hashedKey: `${p}h2`, shortId: `${p}s2`, createdBy: { type: 'user', id: 'someone-else' }, owner: { type: 'organization', id: `${p}org` }, createdAt: now })
  await doc('access-grants', { _id: `${p}grant`, account: { type: 'organization', id: `${p}org` }, grantedBy: { type: 'user', id: 'x' }, grantedAt: now })
  await doc('remote-registries', { _id: remoteUrl(p), name: `${p}remote`, selectedArtefacts: [], createdAt: now, updatedAt: now })
  await doc('locks', { _id: `sync-remote-${remoteUrl(p)}`, pid: 'test-env', createdAt: now, updatedAt: now })
}

const remaining = async (p: string) => {
  let n = 0
  for (const [collection, id] of owned(p)) {
    if ((await anonymousAx.get(`${testEnv}/docs/${collection}/${encodeURIComponent(id)}`)).data) n++
  }
  return n
}

const download = async (id: string) => (await superAdmin).get(`/api/v1/artefacts/${encodeURIComponent(id)}/download`, { responseType: 'arraybuffer' })

test.describe('test-env', () => {
  test('the clean needs a valid test prefix', async () => {
    for (const params of [{}, { prefix: '' }, { prefix: 'test' }, { prefix: 'test_' }, { prefix: 'test_registry' }, { prefix: 'other_x_' }, { prefix: 'test_.*_' }]) {
      await expect(anonymousAx.delete(testEnv, { params })).rejects.toMatchObject({ status: 400 })
    }
  })

  test('the prefixed clean answers through the reverse proxy too', async () => {
    // the stack's world loader cleans a prefix on every service's public path
    const res = await anonymousAx.delete(`http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}/registry/api/test-env`, { params: { prefix: a } })
    expect(res.status).toBe(204)
    await expect(anonymousAx.delete(`http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}/registry/api/test-env`)).rejects.toMatchObject({ status: 400 })
  })

  test('prefixed clean keeps other prefixes\' artefacts', async () => {
    const admin = await superAdmin
    await anonymousAx.delete(testEnv, { params: { prefix: a } })
    await anonymousAx.delete(testEnv, { params: { prefix: b } })
    await seed(a)
    await seed(b)
    // no prefix owns it: deleted by the test itself, whatever happens
    await upload(unprefixed, 'zz-test-env-unprefixed')
    try {
      expect(await remaining(a)).toBe(10)
      expect(await remaining(b)).toBe(10)

      const res = await anonymousAx.delete(testEnv, { params: { prefix: a } })
      expect(res.status).toBe(204)
      expect(await remaining(a)).toBe(0)
      expect(await remaining(b)).toBe(10)
      // the tarballs of the other prefix and of the unprefixed artefact are still there
      expect((await download(npmId(b))).status).toBe(200)
      expect((await download(unprefixed)).status).toBe(200)

      await anonymousAx.delete(testEnv, { params: { prefix: b } })
      expect(await remaining(b)).toBe(0)
      expect((await download(unprefixed)).status).toBe(200)
    } finally {
      await admin.delete('/api/v1/artefacts/' + encodeURIComponent(unprefixed))
    }
  })
})
