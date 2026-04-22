import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import Busboy from 'busboy'
import { Binary } from 'mongodb'
import { session } from '@data-fair/lib-express/index.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import { resizeThumbnail } from './service.ts'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

// Buffers the single uploaded file in memory (capped at MAX_UPLOAD_BYTES).
// Thumbnails are small and need to be handed to Sharp as a buffer anyway,
// so we skip any filesystem tmp step even for the fs backend.
function bufferSingleFileUpload (req: import('express').Request): Promise<{ data: Buffer, mimetype: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (err: Error | null, result?: { data: Buffer, mimetype: string }) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(result!)
    }

    let fileSeen = false
    let mimetype = 'application/octet-stream'
    const chunks: Buffer[] = []

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 }
    })

    busboy.on('file', (_name, stream, info) => {
      if (fileSeen) { stream.resume(); return }
      fileSeen = true
      mimetype = info.mimeType || mimetype
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('limit', () => {
        settle(httpError(413, `upload exceeds ${MAX_UPLOAD_BYTES} bytes`))
        req.unpipe(busboy)
      })
      stream.on('error', (err) => settle(err))
    })

    busboy.on('error', (err) => settle(err as Error))
    busboy.on('finish', () => {
      if (!fileSeen) return settle(httpError(400, 'no file provided in upload'))
      if (settled) return
      settle(null, { data: Buffer.concat(chunks), mimetype })
    })

    req.on('aborted', () => settle(httpError(400, 'upload aborted')))
    req.pipe(busboy)
  })
}

// Mounted on the artefacts router at /:id/thumbnail
export const artefactThumbnailRouter = Router({ mergeParams: true })

artefactThumbnailRouter.post('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)

    const artefactId = decodeURIComponent((req.params as { id: string }).id)
    const artefact = await mongo.artefacts.findOne({ _id: artefactId })
    if (!artefact) throw httpError(404, 'artefact not found')

    const { data, mimetype } = await bufferSingleFileUpload(req)

    let resized
    try {
      resized = await resizeThumbnail({ data, mimetype })
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
  } catch (err) { next(err) }
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
