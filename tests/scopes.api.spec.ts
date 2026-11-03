/**
 * Scope-restricted sessions: the test non-human identity (admin of org test1) exchanges an
 * assertion for a session limited to some scopes, cf tests/support/nhi.ts.
 * Only the catalog-browsing routes accept a registry scope (api/src/scopes.ts).
 */
import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { decodeJwt } from 'jose'
import type { AxiosInstance } from 'axios'
import { superAdmin, axiosWithApiKey, clean, anonymousAx } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'
import { nhiSession } from './support/nhi.ts'

const enc = encodeURIComponent
const pub = '@test/pub@1'
const privTest1 = '@test/priv-test1@1'
const privOther = '@test/priv-other@1'

const expectStatus = async (promise: Promise<unknown>, status: number) => {
  try {
    await promise
    expect(true, `expected HTTP ${status}`).toBe(false)
  } catch (err: any) {
    expect(err.status, err.data).toBe(status)
  }
}

const ids = async (ax: AxiosInstance, query = '') =>
  (await ax.get('/api/v1/artefacts' + query)).data.results.map((a: any) => a._id)

test.describe('scope-restricted sessions', () => {
  test.beforeEach(async () => {
    await clean()
    const admin = await superAdmin
    const key = (await admin.post('/api/v1/api-keys', { type: 'upload', name: 'scopes-upload' })).data.key
    const uploader = axiosWithApiKey(key)
    for (const id of [pub, privTest1, privOther]) {
      const form = new FormData()
      form.append('file', await createTestTarball({ name: id.slice(0, -2), version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
      await uploader.post('/api/v1/artefacts/npm/' + enc(id), form, { headers: form.getHeaders() })
    }
    await admin.patch('/api/v1/artefacts/' + enc(pub), { public: true })
    await admin.patch('/api/v1/artefacts/' + enc(privTest1), { privateAccess: [{ type: 'organization', id: 'test1', name: 'Test Organization 1' }] })
    await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    await anonymousAx.put(`http://localhost:${process.env.DEV_API_PORT}/api/test-env/artefacts/${enc(pub)}/scan`, {
      summary: { critical: 1, high: 0, medium: 0, low: 0, unknown: 0, total: 1 }
    })
  })

  test('token exchange issues a registry:read scoped session', async () => {
    const { accessToken } = await nhiSession('registry:read')
    expect(decodeJwt(accessToken).scope).toBe('registry:read')
  })

  test('registry:read lists the account catalog', async () => {
    const { cookieAx } = await nhiSession('registry:read')
    const res = await cookieAx.get('/api/v1/artefacts')
    expect(res.data.results.map((a: any) => a._id).sort()).toEqual([privTest1, pub].sort())
    for (const artefact of res.data.results) expect(artefact).not.toHaveProperty('scan')
  })

  test('all:read and the bare registry umbrella are accepted', async () => {
    for (const scope of ['all:read', 'registry']) {
      const { cookieAx } = await nhiSession(scope)
      expect((await cookieAx.get('/api/v1/artefacts')).status, scope).toBe(200)
    }
  })

  test('registry:read reads and downloads', async () => {
    const { cookieAx } = await nhiSession('registry:read')
    expect((await cookieAx.get('/api/v1/artefacts/' + enc(privTest1))).status).toBe(200)
    const download = await cookieAx.get('/api/v1/artefacts/' + enc(privTest1) + '/download', {
      responseType: 'arraybuffer', maxRedirects: 0, validateStatus: s => s === 200 || s === 302
    })
    expect([200, 302]).toContain(download.status)
  })

  test('scopes never widen access', async () => {
    const scoped = await nhiSession('registry:read')
    const unscoped = await nhiSession()
    await expectStatus(scoped.cookieAx.get('/api/v1/artefacts/' + enc(privOther)), 404)
    await expectStatus(unscoped.cookieAx.get('/api/v1/artefacts/' + enc(privOther)), 404)
  })

  test('another family is refused', async () => {
    const { cookieAx } = await nhiSession('datasets:read')
    await expectStatus(cookieAx.get('/api/v1/artefacts'), 403)
    await expectStatus(cookieAx.get('/api/v1/artefacts/' + enc(pub)), 403)
    await expectStatus(cookieAx.get('/api/v1/artefacts/' + enc(pub) + '/download'), 403)
  })

  test('non-catalog routes refuse registry:read', async () => {
    const { cookieAx } = await nhiSession('registry:read')
    await expectStatus(cookieAx.get('/api/v1/access-grants/me'), 403)
    await expectStatus(cookieAx.get('/api/v1/api-keys'), 403)
    await expectStatus(cookieAx.patch('/api/v1/artefacts/' + enc(pub), { public: false }), 403)
  })

  test('a scoped session is never admin', async () => {
    const { cookieAx } = await nhiSession('registry:read')
    const res = await cookieAx.get('/api/v1/artefacts?sort=-vulnerabilities')
    for (const artefact of res.data.results) expect(artefact).not.toHaveProperty('scan')
    expect(res.data.results.map((a: any) => a._id)).toEqual(await ids(cookieAx))
  })

  test('unscoped session keeps working', async () => {
    const { cookieAx } = await nhiSession()
    expect((await cookieAx.get('/api/v1/artefacts')).status).toBe(200)
  })

  test('bearer token is accepted', async () => {
    const { bearerAx, accessToken } = await nhiSession('registry:read')
    test.skip(!decodeJwt(accessToken).aud, 'needs a simple-directory issuing access token audiences')
    expect((await ids(bearerAx)).sort()).toEqual([privTest1, pub].sort())
  })
})
