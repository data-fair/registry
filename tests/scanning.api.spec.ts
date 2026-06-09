import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, anonymousAx, axiosAuth, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

const id = '@test/pkg@1'
const enc = encodeURIComponent(id)

const injectScan = async (artefactId: string, summary: any, findings: any[]) => {
  await anonymousAx.put(
    `http://localhost:${process.env.DEV_API_PORT}/api/test-env/artefacts/${encodeURIComponent(artefactId)}/scan`,
    { summary, findings }
  )
}

test.describe('Scanning', () => {
  let uploadApiKey: string
  test.beforeEach(async () => {
    await clean()
    const admin = await superAdmin
    const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
    const form = new FormData()
    form.append('file', await createTestTarball({ name: '@test/pkg', version: '1.0.0' }), { filename: 'p.tgz', contentType: 'application/gzip' })
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/npm/' + enc, form, { headers: form.getHeaders() })
    await admin.patch('/api/v1/artefacts/' + enc, { public: true })
  })

  // The inject-based read/strip tests below deliberately use FILE artefacts:
  // file uploads never trigger a scan, so the injected scan state is
  // authoritative and immune to the real auto-scan that npm uploads kick off
  // when scanning is enabled (as it is in the dev config the tests run against).
  const uploadFile = async (name: string) => {
    const form = new FormData()
    form.append('file', Buffer.from('scan-test'), { filename: 'f.bin', contentType: 'application/octet-stream' })
    form.append('category', 'other')
    await axiosWithApiKey(uploadApiKey).post('/api/v1/artefacts/file/' + encodeURIComponent(name), form, { headers: form.getHeaders() })
  }

  test('scan summary is visible to admins on GET /:id but stripped for others', async () => {
    const fid = '@test/scan-summary'
    const fenc = encodeURIComponent(fid)
    await uploadFile(fid)
    const admin = await superAdmin
    await admin.patch('/api/v1/artefacts/' + fenc, { public: true })
    await injectScan(fid, { critical: 0, high: 1, medium: 0, low: 0, unknown: 0, total: 1 },
      [{ id: 'GHSA-x', pkgName: 'minimist', installedVersion: '0.0.8', severity: 'high' }])

    const adminRes = await admin.get('/api/v1/artefacts/' + fenc)
    expect(adminRes.data.scan?.summary?.high).toBe(1)

    const userAx = await axiosAuth('test1-user1')
    const userRes = await userAx.get('/api/v1/artefacts/' + fenc)
    expect(userRes.data.scan).toBeUndefined()
  })

  test('GET /:id/scan returns full findings for admin, 403/401 for non-admin', async () => {
    const fid = '@test/scan-findings'
    const fenc = encodeURIComponent(fid)
    await uploadFile(fid)
    await injectScan(fid, { critical: 0, high: 1, medium: 0, low: 0, unknown: 0, total: 1 },
      [{ id: 'GHSA-x', pkgName: 'minimist', installedVersion: '0.0.8', fixedVersion: '0.2.1', severity: 'high' }])

    const admin = await superAdmin
    const res = await admin.get('/api/v1/artefacts/' + fenc + '/scan')
    expect(res.data.vulnerabilities[0].pkgName).toBe('minimist')

    try {
      await anonymousAx.get('/api/v1/artefacts/' + fenc + '/scan')
      expect(true).toBe(false)
    } catch (err: any) {
      expect([401, 403]).toContain(err.status)
    }
  })

  test('GET /:id/scan returns 404 when never scanned', async () => {
    // An id that was never uploaded/scanned has no scan doc regardless of
    // whether scanning is enabled.
    const admin = await superAdmin
    try {
      await admin.get('/api/v1/artefacts/' + encodeURIComponent('@test/never-scanned@1') + '/scan')
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  test('POST /:id/scan returns 202 when scanning is enabled, else 503', async () => {
    const admin = await superAdmin
    try {
      const res = await admin.post('/api/v1/artefacts/' + enc + '/scan')
      expect([202, 503]).toContain(res.status)
    } catch (err: any) {
      expect([503]).toContain(err.status)
    }
  })

  test('POST /:id/scan rejects a non-admin caller', async () => {
    try {
      await anonymousAx.post('/api/v1/artefacts/' + enc + '/scan')
      expect(true).toBe(false)
    } catch (err: any) {
      expect([401, 403]).toContain(err.status)
    }
  })
})
