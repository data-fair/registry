import { Router } from 'express'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Busboy from 'busboy'
import { Binary } from 'mongodb'
import { session } from '@data-fair/lib-express/index.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import config from '#config'
import { resizeThumbnail } from './service.ts'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const createUploadTmpDir = async () => {
  const base = config.tmpDir || tmpdir()
  await mkdir(base, { recursive: true })
  return mkdtemp(join(base, 'registry-thumbnail-'))
}

function streamSingleFileUpload (req: import('express').Request, destPath: string): Promise<{ mimetype: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (err: Error | null, result?: { mimetype: string }) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(result!)
    }

    let fileSeen = false
    let mimetype = 'application/octet-stream'
    let pendingWrite: Promise<void> | null = null

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 }
    })

    busboy.on('file', (_name, stream, info) => {
      if (fileSeen) { stream.resume(); return }
      fileSeen = true
      mimetype = info.mimeType || mimetype
      stream.on('limit', () => {
        settle(httpError(413, `upload exceeds ${MAX_UPLOAD_BYTES} bytes`))
        stream.unpipe()
        req.unpipe(busboy)
      })
      pendingWrite = pipeline(stream, createWriteStream(destPath)).catch((err) => settle(err))
    })

    busboy.on('error', (err) => settle(err as Error))
    busboy.on('finish', async () => {
      if (!fileSeen) return settle(httpError(400, 'no file provided in upload'))
      try { if (pendingWrite) await pendingWrite } catch (err) { return settle(err as Error) }
      if (settled) return
      settle(null, { mimetype })
    })

    req.on('aborted', () => settle(httpError(400, 'upload aborted')))
    req.pipe(busboy)
  })
}

// Mounted on the artefacts router at /:id/thumbnail
export const artefactThumbnailRouter = Router({ mergeParams: true })

artefactThumbnailRouter.post('/', async (req, res, next) => {
  let tmpDir: string | undefined
  try {
    await session.reqAdminMode(req)

    const artefactId = decodeURIComponent((req.params as { id: string }).id)
    const artefact = await mongo.artefacts.findOne({ _id: artefactId })
    if (!artefact) throw httpError(404, 'artefact not found')

    tmpDir = await createUploadTmpDir()
    const tmpFile = join(tmpDir, 'upload.bin')
    const { mimetype } = await streamSingleFileUpload(req, tmpFile)

    let resized
    try {
      resized = await resizeThumbnail({ filePath: tmpFile, mimetype })
    } catch (err: any) {
      if (err?.message === 'IMAGE_EXCEEDS_PIXEL_LIMIT') throw httpError(400, 'image exceeds maximum pixel limit')
      if (err?.message === 'INVALID_IMAGE_DIMENSIONS') throw httpError(400, 'invalid image')
      throw httpError(400, `image processing failed: ${err?.message ?? err}`)
    }

    const id = randomUUID()
    const createdAt = new Date().toISOString()

    // Remove previous thumbnail (if any), then insert the new one.
    await mongo.thumbnails.deleteMany({ artefactId })
    await mongo.thumbnails.insertOne({
      _id: id,
      artefactId,
      data: new Binary(resized.data),
      mimeType: 'image/webp',
      width: resized.width,
      height: resized.height,
      byteSize: resized.byteSize,
      createdAt
    })

    const updated = await mongo.artefacts.findOneAndUpdate(
      { _id: artefactId },
      {
        $set: {
          thumbnail: { id, width: resized.width, height: resized.height },
          updatedAt: createdAt
        }
      },
      { returnDocument: 'after' }
    )
    res.status(201).json(updated)
  } catch (err) { next(err) } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})

artefactThumbnailRouter.delete('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const artefactId = decodeURIComponent((req.params as { id: string }).id)
    const artefact = await mongo.artefacts.findOne({ _id: artefactId })
    if (!artefact) throw httpError(404, 'artefact not found')
    await mongo.thumbnails.deleteMany({ artefactId })
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      { $unset: { thumbnail: '' }, $set: { updatedAt: new Date().toISOString() } }
    )
    res.status(204).send()
  } catch (err) { next(err) }
})

// Mounted at app level: public, cache-friendly
export const publicThumbnailsRouter = Router()

publicThumbnailsRouter.get('/:id/data', async (req, res, next) => {
  try {
    const thumbnail = await mongo.thumbnails.findOne({ _id: req.params.id })
    if (!thumbnail) throw httpError(404, 'thumbnail not found')
    res.set('Content-Type', thumbnail.mimeType)
    res.set('Cache-Control', 'public, max-age=31536000, immutable')
    res.set('X-Accel-Buffering', 'yes')
    res.set('Content-Length', String(thumbnail.byteSize))
    res.send(thumbnail.data.buffer)
  } catch (err) { next(err) }
})
