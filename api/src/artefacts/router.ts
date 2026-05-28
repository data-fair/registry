import { Router } from 'express'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import Busboy from 'busboy'
import { session } from '@data-fair/lib-express/index.js'
import { reqIsInternal } from '@data-fair/lib-express/req-origin.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { Artefact } from '#types/artefact/index.ts'
import config from '#config'
import { authenticateApiKey, resolveCaller, tryInternalSecretWithAccount } from '../auth.ts'
import { artefactAccessFilter, assertDownloadAccess } from '../access.ts'
import { filesStorage } from '../files-storage/index.ts'
import {
  listArtefacts, getArtefact, getArtefactById, patchArtefact, deleteArtefact,
  commitFileUpload, commitNpmUpload, extractStagedManifest, resolveDownload,
  listGroupValues
} from './service.ts'
import * as patchReqBody from '#doc/artefacts/patch-req/index.ts'
import { artefactThumbnailRouter } from '../thumbnails/router.ts'

const router = Router()
export default router

router.use('/:id/thumbnail', artefactThumbnailRouter)

const npmCategories = ['processing', 'catalog', 'application', 'other'] as const
const fileCategories = ['tileset', 'maplibre-style', 'other'] as const
const allCategories = [...new Set<string>([...npmCategories, ...fileCategories])]

const MAX_UPLOAD_BYTES = config.maxUploadBytes ?? 500 * 1024 * 1024

type Category = Artefact['category']
const pickCategory = (raw: string | undefined, allowed: readonly string[]): Category => {
  const value = raw || 'other'
  if (!allowed.includes(value)) {
    throw httpError(400, `invalid category "${value}", must be one of: ${allowed.join(', ')}`)
  }
  return value as Category
}

type LocalizedString = { fr?: string, en?: string }
const parseLocalizedField = (raw: string, field: string): LocalizedString => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw httpError(400, `invalid JSON in field "${field}"`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw httpError(400, `field "${field}" must be an object`)
  }
  const obj = parsed as Record<string, unknown>
  const result: LocalizedString = {}
  for (const key of ['fr', 'en'] as const) {
    const value = obj[key]
    if (value === undefined) continue
    if (typeof value !== 'string') throw httpError(400, `field "${field}.${key}" must be a string`)
    if (value.length > 2000) throw httpError(400, `field "${field}.${key}" exceeds 2000 characters`)
    result[key] = value
  }
  return result
}

const safeDecode = (raw: string): string => {
  try {
    return decodeURIComponent(raw)
  } catch {
    throw httpError(400, 'malformed URL path segment')
  }
}

// Local internal-secret check used only by the upload endpoints (which don't
// care about per-account scoping — uploads are admin-style operations).
const tryInternalSecret = (req: import('express').Request): boolean => {
  if (!reqIsInternal(req)) return false
  const secretKey = req.get('x-secret-key')
  if (!secretKey || !config.secretKeys.internalServices) return false
  const received = Buffer.from(secretKey, 'utf-8')
  const expected = Buffer.from(config.secretKeys.internalServices, 'utf-8')
  if (received.length !== expected.length) return false
  return timingSafeEqual(received, expected)
}

// List artefacts (filtered by access)
router.get('/', async (req, res, next) => {
  try {
    const filter = artefactAccessFilter(await resolveCaller(req))
    const skip = Math.max(0, Math.min(parseInt(req.query.skip as string) || 0, 100000))
    const size = Math.min(parseInt(req.query.size as string) || 10, 100)
    const sort: Record<string, 1 | -1> = req.query.sort === 'name' ? { name: 1 } : { dataUpdatedAt: -1 }

    // Text search on name
    if (req.query.q) {
      filter.$text = { $search: req.query.q as string }
    }
    // Category filter
    if (req.query.category) {
      if (!allCategories.includes(req.query.category as string)) {
        throw httpError(400, `invalid category, must be one of: ${allCategories.join(', ')}`)
      }
      filter.category = req.query.category as Category
    }
    // Format filter
    if (req.query.format) {
      const allowedFormats = ['npm', 'file']
      if (!allowedFormats.includes(req.query.format as string)) {
        throw httpError(400, `invalid format, must be one of: ${allowedFormats.join(', ')}`)
      }
      filter.format = req.query.format as Artefact['format']
    }
    // Deprecated artefacts are hidden from the default listing; an explicit
    // flag brings them back. `$ne: true` also matches docs missing the field.
    if (req.query.includeDeprecated !== 'true') {
      filter.deprecated = { $ne: true }
    }

    const { results, count } = await listArtefacts(filter, { sort, skip, size })
    res.json({ results, count })
  } catch (err) { next(err) }
})

// Distinct group values for a category — seeds the group combobox suggestions
// in the admin form. Registered before GET /:id so it isn't swallowed as an id.
router.get('/groups', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const category = req.query.category as string
    if (!category || !allCategories.includes(category)) {
      throw httpError(400, `invalid category, must be one of: ${allCategories.join(', ')}`)
    }
    const locale = req.query.locale === 'fr' ? 'fr' : req.query.locale === 'en' ? 'en' : null
    if (!locale) throw httpError(400, 'locale query param must be "en" or "fr"')
    const results = await listGroupValues(category as Category, locale)
    res.json({ results })
  } catch (err) { next(err) }
})

// Get artefact detail
// All formats carry their tarball references directly on the doc.
router.get('/:id', async (req, res, next) => {
  try {
    const filter = artefactAccessFilter(await resolveCaller(req))
    const artefact = await getArtefact(req.params.id, filter)
    if (!artefact) throw httpError(404, 'artefact not found')
    res.json(artefact)
  } catch (err) { next(err) }
})

// Update editable metadata (superadmin OR internal-service)
//
// TEMPORARY: internal secret is accepted so the v6.0 first-boot migration
// from the sister processings service can push title/description/public/
// privateAccess from its legacy on-disk metadata.
router.patch('/:id', async (req, res, next) => {
  try {
    const internalAuth = tryInternalSecretWithAccount(req)
    if (!internalAuth) await session.reqAdminMode(req)
    const body = patchReqBody.returnValid(req.body, { name: 'body' })

    const existing = await getArtefactById(req.params.id)
    if (!existing) throw httpError(404, 'artefact not found')

    if (existing.origin) {
      const allowed = new Set(['public', 'privateAccess'])
      const forbidden = Object.keys(body).filter(k => !allowed.has(k))
      if (forbidden.length > 0) {
        throw httpError(403, 'mirrored artefact: only public and privateAccess can be edited locally')
      }
    }

    const result = await patchArtefact(req.params.id, body)
    if (!result) throw httpError(404, 'artefact not found')
    res.json(result)
  } catch (err) { next(err) }
})

// Delete artefact (superadmin)
router.delete('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const artefact = await getArtefactById(req.params.id)
    if (!artefact) throw httpError(404, 'artefact not found')
    if (artefact.origin) throw httpError(403, 'mirrored artefact: unselect the mirror instead of deleting')

    await deleteArtefact(artefact)
    res.status(204).send()
  } catch (err) { next(err) }
})

// Upload raw file (API key or internal secret auth, multipart)
// TEMPORARY: internal secret is accepted for uploads to help manage the transition —
// services that previously managed their plugins locally can upload to the registry
// to switch to the new centralized mode.
router.post('/file/:name', async (req, res, next) => {
  const stagingPath = `_staging/${randomUUID()}.bin`
  let stagingStored = false
  try {
    const isInternal = tryInternalSecret(req)
    let apiKey: Awaited<ReturnType<typeof authenticateApiKey>> | null = null
    if (!isInternal) {
      apiKey = await authenticateApiKey(req)
      if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload files')
    }

    const name = safeDecode(req.params.name)
    if (apiKey?.allowedNamePrefix && !name.startsWith(apiKey.allowedNamePrefix)) {
      throw httpError(403, `this API key is not allowed to upload "${name}"`)
    }
    const artefactId = name

    const existingFileArtefact = await getArtefactById(artefactId)
    if (existingFileArtefact?.origin) {
      throw httpError(409, 'this artefact is managed by a remote registry')
    }

    // Stream the multipart file straight into the configured storage at a
    // staging path — no local fs tmp needed even for the S3 backend.
    const fields = await streamFileUpload(req, (stream) => filesStorage.writeStream(stream, stagingPath))
    stagingStored = true

    // Parse optional JSON fields with explicit 400 on malformed input.
    const title = fields.title ? parseLocalizedField(fields.title, 'title') : undefined
    const description = fields.description ? parseLocalizedField(fields.description, 'description') : undefined

    const category = pickCategory(fields.category, fileCategories)
    if (apiKey?.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    const artefact = await commitFileUpload({
      artefactId,
      name,
      fileName: fields.fileName || name,
      stagingPath,
      category,
      title,
      description,
      uploadedBy: apiKey
        ? { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId }
        : { internal: true }
    })
    stagingStored = false
    res.status(201).json({ artefact })
  } catch (err) {
    if (stagingStored) await filesStorage.delete(stagingPath).catch(() => {})
    next(err)
  }
})

// Upload npm artefact (API key or internal secret auth, multipart).
router.post('/npm/:id', async (req, res, next) => {
  const stagingPath = `_staging/${randomUUID()}.tgz`
  let stagingStored = false
  try {
    const isInternal = tryInternalSecret(req)
    let apiKey: Awaited<ReturnType<typeof authenticateApiKey>> | null = null
    if (!isInternal) {
      apiKey = await authenticateApiKey(req)
      if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload npm artefacts')
    }

    const id = safeDecode(req.params.id)
    if (apiKey?.allowedNamePrefix && !id.startsWith(apiKey.allowedNamePrefix)) {
      throw httpError(403, `this API key is not allowed to upload "${id}"`)
    }

    const existing = await getArtefactById(id)
    if (existing?.origin) {
      throw httpError(409, 'this artefact is managed by a remote registry')
    }
    if (existing && existing.format !== 'npm') {
      throw httpError(409, `this artefact already exists as a "${existing.format}" artefact`)
    }

    const { category: uploadCategory } = await streamTarballUpload(req, (stream) => filesStorage.writeStream(stream, stagingPath))
    stagingStored = true

    const { manifest, hasNativeModules } = await extractStagedManifest(stagingPath)

    if (existing?.packageName && existing.packageName !== manifest.name) {
      throw httpError(409, `package name mismatch: existing artefact tracks "${existing.packageName}", upload manifest says "${manifest.name}"`)
    }

    const category = pickCategory(uploadCategory, npmCategories)
    if (apiKey?.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    const artefact = await commitNpmUpload({
      id,
      stagingPath,
      manifest,
      hasNativeModules,
      category,
      uploadedBy: apiKey
        ? { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId }
        : { internal: true },
      existing
    })
    stagingStored = false
    res.status(201).json({ artefact })
  } catch (err) {
    if (stagingStored) await filesStorage.delete(stagingPath).catch(() => {})
    next(err)
  }
})

// Download an artefact's bytes (raw file OR npm tarball — same endpoint).
//
// Last-Modified is derived from the doc's dataUpdatedAt (not the storage file
// mtime). The If-Modified-Since check runs in the route handler so 304 works
// for both fs streaming AND the S3 signed-URL redirect path.
//
// For npm artefacts the response also carries X-Artefact-Version and
// X-Artefact-Has-Native-Modules so the lib-node client can avoid a separate
// GET /:id metadata roundtrip.
router.get('/:id/download', async (req, res, next) => {
  try {
    const caller = await resolveCaller(req)
    // Download is "I already know the id" — unlike listing, hiding the
    // artefact behind 404 is unhelpful: callers can't distinguish "doesn't
    // exist" from "you can't have it". Look up unfiltered and let
    // assertDownloadAccess decide between 200 and 403.
    const artefact = await getArtefactById(req.params.id)
    if (!artefact) throw httpError(404, 'artefact not found')
    await assertDownloadAccess(caller, artefact)
    if (!artefact.path) throw httpError(404, 'no content uploaded for this artefact')

    // dataUpdatedAt is the canonical "content changed" timestamp on the doc
    // (PATCH only touches updatedAt). Per-second resolution (HTTP-date) is
    // accepted: sub-second republishes alias together but in practice an
    // upload is far slower than that.
    const lastModified = new Date(artefact.dataUpdatedAt ?? artefact.updatedAt ?? Date.now())
    res.set('Last-Modified', lastModified.toUTCString())
    res.set('Cache-Control', 'no-cache')
    if (artefact.format === 'npm') {
      res.set('X-Artefact-Version', artefact.version ?? '')
      res.set('X-Artefact-Has-Native-Modules', artefact.hasNativeModules ? 'true' : 'false')
    }

    const ifModifiedSince = req.get('If-Modified-Since')
    if (ifModifiedSince) {
      const since = Math.floor(new Date(ifModifiedSince).getTime() / 1000)
      const mod = Math.floor(lastModified.getTime() / 1000)
      if (!isNaN(since) && since >= mod) {
        res.status(304).end()
        return
      }
    }

    const filename = artefact.format === 'npm'
      ? `${artefact.name}-${artefact.version || 'tarball'}.tgz`
      : (artefact.fileName || artefact.name)
    const download = await resolveDownload(artefact.path, filename)
    if ('redirectUrl' in download) {
      res.redirect(302, download.redirectUrl)
      return
    }

    res.set('Content-Type', artefact.format === 'npm' ? 'application/gzip' : 'application/octet-stream')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    res.set('Content-Length', String(download.size))
    await pipeline(download.body, res).catch((err) => {
      if (!res.headersSent) next(err)
    })
  } catch (err) { next(err) }
})

// Helper: stream a multipart upload containing a tarball to a caller-provided
// sink (typically the configured files-storage backend), collecting the
// `category` field if present. Enforces MAX_UPLOAD_BYTES at the busboy layer.
type StreamWriter = (stream: Readable) => Promise<void>

function streamTarballUpload (req: import('express').Request, writer: StreamWriter): Promise<{ category?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (err: Error | null, result?: { category?: string }) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(result!)
    }

    let category: string | undefined
    let fileSeen = false
    let pendingWrite: Promise<void> | null = null

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 20,
        fieldSize: 64 * 1024,
        fieldNameSize: 200
      }
    })

    busboy.on('field', (name, val) => {
      // The artefact category comes solely from this multipart field; the
      // package.json manifest is never inspected for one. Absent here, the
      // category defaults to "other".
      if (name === 'category') category = val
    })

    busboy.on('file', (_name, stream) => {
      if (fileSeen) {
        stream.resume()
        return
      }
      fileSeen = true

      stream.on('limit', () => {
        // Destroy the source so the backend upload fails and aborts cleanly.
        stream.destroy(httpError(413, `upload exceeds ${MAX_UPLOAD_BYTES} bytes`))
        req.unpipe(busboy)
      })

      pendingWrite = writer(stream).catch((err) => {
        settle(err)
      })
    })

    busboy.on('error', (err) => settle(err as Error))
    busboy.on('finish', async () => {
      if (!fileSeen) return settle(httpError(400, 'no file provided in upload'))
      try {
        if (pendingWrite) await pendingWrite
      } catch (err) {
        return settle(err as Error)
      }
      if (settled) return
      settle(null, { category })
    })

    req.on('aborted', () => settle(httpError(400, 'upload aborted')))
    req.pipe(busboy)
  })
}

// Helper: stream a multipart upload containing a raw file to a caller-provided
// sink, collecting all text fields. Enforces MAX_UPLOAD_BYTES.
function streamFileUpload (req: import('express').Request, writer: StreamWriter): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (err: Error | null, result?: Record<string, string>) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(result!)
    }

    const fields: Record<string, string> = {}
    let fileSeen = false
    let pendingWrite: Promise<void> | null = null

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 20,
        fieldSize: 64 * 1024,
        fieldNameSize: 200
      }
    })

    busboy.on('field', (name, val) => {
      fields[name] = val
    })

    busboy.on('file', (_name, stream, info) => {
      if (fileSeen) {
        stream.resume()
        return
      }
      fileSeen = true
      if (!fields.fileName && info.filename) fields.fileName = info.filename

      stream.on('limit', () => {
        stream.destroy(httpError(413, `upload exceeds ${MAX_UPLOAD_BYTES} bytes`))
        req.unpipe(busboy)
      })

      pendingWrite = writer(stream).catch((err) => {
        settle(err)
      })
    })

    busboy.on('error', (err) => settle(err as Error))
    busboy.on('finish', async () => {
      if (!fileSeen) return settle(httpError(400, 'no file provided in upload'))
      try {
        if (pendingWrite) await pendingWrite
      } catch (err) {
        return settle(err as Error)
      }
      if (settled) return
      settle(null, fields)
    })

    req.on('aborted', () => settle(httpError(400, 'upload aborted')))
    req.pipe(busboy)
  })
}
