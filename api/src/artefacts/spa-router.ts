import { Router } from 'express'
import { pipeline } from 'node:stream/promises'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import { filesStorage } from '../files-storage/index.ts'
import { tryInternalSecret } from '../auth.ts'

const router = Router()
export default router

// A ref segment is `<major>.<minor>` — the boundary between the package name
// segments and the file path in `/apps/<packageName>/<ref>/<...file>`.
const REF_RE = /^\d+\.\d+$/

const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  txt: 'text/plain; charset=utf-8',
  wasm: 'application/wasm'
}
const IMMUTABLE_EXT = new Set(['js', 'mjs', 'css', 'woff', 'woff2', 'ttf', 'wasm'])

// Public static serving for spa artefacts.
//   /apps/<packageName>/<major>.<minor>/<...filePath>
// index.html and the bare directory path are internal-only (x-secret-key);
// every other file is public.
router.get('/{*splat}', async (req, res, next) => {
  try {
    const segments: string[] = (req.params as Record<string, string[] | undefined>).splat ?? []
    if (segments.some(s => s === '' || s === '.' || s === '..')) throw httpError(404, 'not found')

    const refIdx = segments.findIndex(s => REF_RE.test(s))
    // need at least one package-name segment before the ref
    if (refIdx < 1) throw httpError(404, 'not found')
    const id = `${segments.slice(0, refIdx).join('/')}@${segments[refIdx]}`
    let filePath = segments.slice(refIdx + 1).join('/')

    const artefact = await mongo.artefacts.findOne({ _id: id, format: 'spa' })
    if (!artefact?.extractedPath) throw httpError(404, 'not found')

    const isIndex = filePath === '' || filePath === 'index.html'
    if (isIndex) {
      filePath = 'index.html'
      // 404 (not 403) for the anonymous case so existence is never leaked.
      if (!tryInternalSecret(req)) throw httpError(404, 'not found')
    }

    let download
    try {
      download = await filesStorage.readStream(`${artefact.extractedPath}/${filePath}`, req.get('If-Modified-Since'))
    } catch (err: unknown) {
      const e = err as { status?: number, code?: string, name?: string, $metadata?: { httpStatusCode?: number } }
      if (e?.status === 304) { res.status(304).end(); return }
      if (e?.code === 'ENOENT' || e?.name === 'NoSuchKey' || e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) {
        throw httpError(404, 'not found')
      }
      throw err
    }

    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
    res.setHeader('Content-Length', String(download.size))
    res.setHeader('Last-Modified', download.lastModified.toUTCString())
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Accel-Buffering', 'yes')
    if (isIndex) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate')
    } else if (IMMUTABLE_EXT.has(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300')
    }
    await pipeline(download.body, res).catch((err) => { if (!res.headersSent) next(err) })
  } catch (err) { next(err) }
})
