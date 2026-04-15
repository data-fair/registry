import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import sharp from 'sharp'
import { superAdmin, anonymousAx, axiosAuth, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

const makePng = (width = 600, height = 400) => sharp({
  create: { width, height, channels: 3, background: { r: 10, g: 120, b: 200 } }
}).png().toBuffer()

let uploadApiKey: string

const createArtefact = async (name = '@test/pkg') => {
  const ax = axiosWithApiKey(uploadApiKey)
  const tarball = await createTestTarball({ name, version: '1.0.0' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  await ax.post(`/api/v1/artefacts/${encodeURIComponent(name)}/versions`, form, { headers: form.getHeaders() })
  return `${name}@1`
}

const uploadThumb = async (ax: any, artefactId: string, buf: Buffer) => {
  const form = new FormData()
  form.append('file', buf, { filename: 'thumb.png', contentType: 'image/png' })
  return ax.post(`/api/v1/artefacts/${encodeURIComponent(artefactId)}/thumbnail`, form, { headers: form.getHeaders() })
}

test.describe('Thumbnails', () => {
  test.beforeEach(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
  })

  test('superadmin uploads a thumbnail and anonymous can fetch it', async () => {
    const artefactId = await createArtefact()
    const admin = await superAdmin
    const png = await makePng()
    const res = await uploadThumb(admin, artefactId, png)
    expect(res.status).toBe(201)
    expect(res.data.thumbnail).toBeTruthy()
    expect(res.data.thumbnail.id).toBeTruthy()
    expect(res.data.thumbnail.width).toBeGreaterThan(0)
    expect(res.data.thumbnail.height).toBeGreaterThan(0)

    const thumbId = res.data.thumbnail.id
    const get = await anonymousAx.get(`/api/v1/thumbnails/${thumbId}/data`, { responseType: 'arraybuffer' })
    expect(get.status).toBe(200)
    expect(get.headers['content-type']).toBe('image/webp')
    expect(get.headers['cache-control']).toContain('immutable')
    expect(Buffer.from(get.data).slice(0, 4).toString()).toBe('RIFF')
  })

  test('replacing a thumbnail invalidates the old id', async () => {
    const artefactId = await createArtefact()
    const admin = await superAdmin

    const first = await uploadThumb(admin, artefactId, await makePng(800, 600))
    const firstId = first.data.thumbnail.id

    const second = await uploadThumb(admin, artefactId, await makePng(400, 300))
    const secondId = second.data.thumbnail.id
    expect(secondId).not.toBe(firstId)

    try {
      await anonymousAx.get(`/api/v1/thumbnails/${firstId}/data`)
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
    const get = await anonymousAx.get(`/api/v1/thumbnails/${secondId}/data`, { responseType: 'arraybuffer' })
    expect(get.status).toBe(200)
  })

  test('removing a thumbnail clears the artefact field and doc', async () => {
    const artefactId = await createArtefact()
    const admin = await superAdmin
    const upload = await uploadThumb(admin, artefactId, await makePng())
    const thumbId = upload.data.thumbnail.id

    const del = await admin.delete(`/api/v1/artefacts/${encodeURIComponent(artefactId)}/thumbnail`)
    expect(del.status).toBe(204)

    const get = await admin.get(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`)
    expect(get.data.thumbnail).toBeUndefined()

    try {
      await anonymousAx.get(`/api/v1/thumbnails/${thumbId}/data`)
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  test('non-admin cannot upload a thumbnail', async () => {
    const artefactId = await createArtefact()
    const ax = await axiosAuth('dev-standalone1')
    try {
      await uploadThumb(ax, artefactId, await makePng())
      expect(true).toBe(false)
    } catch (err: any) {
      expect([401, 403]).toContain(err.status)
    }
  })

  test('upload targeting a missing artefact returns 404', async () => {
    const admin = await superAdmin
    try {
      await uploadThumb(admin, '@no/such@1', await makePng())
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  test('deleting an artefact removes its thumbnail', async () => {
    const artefactId = await createArtefact()
    const admin = await superAdmin
    const upload = await uploadThumb(admin, artefactId, await makePng())
    const thumbId = upload.data.thumbnail.id

    await admin.delete(`/api/v1/artefacts/${encodeURIComponent(artefactId)}`)

    try {
      await anonymousAx.get(`/api/v1/thumbnails/${thumbId}/data`)
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })
})
