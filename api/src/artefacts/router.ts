import { Router } from 'express'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import Busboy from 'busboy'
import { session } from '@data-fair/lib-express/index.js'
import { reqIsInternal } from '@data-fair/lib-express/req-origin.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { Artefact } from '#types/artefact/index.ts'
import mongo from '#mongo'
import config from '#config'
import { authenticateApiKey, resolveCaller, tryInternalSecretWithAccount } from '../auth.ts'
import { artefactAccessFilter, assertDownloadAccess } from '../access.ts'
import { writeFile, readFile, getDownloadUrl, deleteFile, moveFile, fileStats } from '../files-storage/index.ts'
import { extractManifest } from './service.ts'
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

    const [results, count] = await Promise.all([
      mongo.artefacts.find(filter).sort(sort).skip(skip).limit(size).toArray(),
      mongo.artefacts.countDocuments(filter)
    ])
    res.json({ results, count })
  } catch (err) { next(err) }
})

// Get artefact detail
// All formats carry their tarball references directly on the doc.
router.get('/:id', async (req, res, next) => {
  try {
    const filter = artefactAccessFilter(await resolveCaller(req))
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
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

    const existing = await mongo.artefacts.findOne({ _id: req.params.id })
    if (!existing) throw httpError(404, 'artefact not found')

    if (existing.origin) {
      const allowed = new Set(['public', 'privateAccess'])
      const forbidden = Object.keys(body).filter(k => !allowed.has(k))
      if (forbidden.length > 0) {
        throw httpError(403, 'mirrored artefact: only public and privateAccess can be edited locally')
      }
    }

    // Remove null values (PATCH null = unset the field)
    const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    const $unset: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(body)) {
      if (value === null) $unset[key] = ''
      else $set[key] = value
    }
    const update: Record<string, unknown> = { $set }
    if (Object.keys($unset).length > 0) update.$unset = $unset

    const result = await mongo.artefacts.findOneAndUpdate(
      { _id: req.params.id },
      update,
      { returnDocument: 'after' }
    )
    if (!result) throw httpError(404, 'artefact not found')
    res.json(result)
  } catch (err) { next(err) }
})

// Delete artefact (superadmin)
router.delete('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id })
    if (!artefact) throw httpError(404, 'artefact not found')
    if (artefact.origin) throw httpError(403, 'mirrored artefact: unselect the mirror instead of deleting')

    // Delete DB state first so concurrent GETs fail cleanly with 404,
    // then best-effort remove files.
    await mongo.artefacts.deleteOne({ _id: artefact._id })
    if (artefact.format === 'file') {
      if (artefact.filePath) await deleteFile(artefact.filePath)
    } else {
      // npm artefacts store tarballs inline in the `tarballs` map
      for (const slot of Object.values(artefact.tarballs ?? {})) {
        await deleteFile(slot.path).catch(() => {})
      }
    }
    await mongo.thumbnails.deleteMany({ artefactId: artefact._id })
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
  let newFilePath: string | undefined
  let storedOk = false
  try {
    const isInternal = tryInternalSecret(req)
    let apiKey: Awaited<ReturnType<typeof authenticateApiKey>> | null = null
    if (!isInternal) {
      apiKey = await authenticateApiKey(req)
      if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload files')
    }

    const name = safeDecode(req.params.name)
    if (apiKey?.allowedName && apiKey.allowedName !== name) {
      throw httpError(403, `this API key is not allowed to upload "${name}"`)
    }
    const artefactId = name

    const existingFileArtefact = await mongo.artefacts.findOne({ _id: artefactId })
    if (existingFileArtefact?.origin) {
      throw httpError(409, 'this artefact is managed by a remote registry')
    }

    // Stream the multipart file straight into the configured storage at a
    // staging path — no local fs tmp needed even for the S3 backend.
    const fields = await streamFileUpload(req, (stream) => writeFile(stream, stagingPath))
    stagingStored = true

    // Parse optional JSON fields with explicit 400 on malformed input.
    const title = fields.title ? parseLocalizedField(fields.title, 'title') : undefined
    const description = fields.description ? parseLocalizedField(fields.description, 'description') : undefined

    const category = pickCategory(fields.category, fileCategories)
    if (apiKey?.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    // Store NEW file first, then DB commit, then delete OLD — avoids a
    // window where the artefact row points at a missing file.
    const existing = await mongo.artefacts.findOne({ _id: artefactId })
    const fileName = fields.fileName || name
    // Namespace new writes with a random suffix so a failed delete of the
    // old file doesn't clobber the fresh one.
    const filePath = `files/${name}/${randomUUID()}-${fileName}`
    await moveFile(stagingPath, filePath)
    stagingStored = false
    newFilePath = filePath
    const { size } = await fileStats(filePath)

    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          filePath,
          fileName,
          size,
          category,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          uploadedBy: apiKey
            ? { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId }
            : { internal: true },
          updatedAt: now,
          dataUpdatedAt: now
        },
        $setOnInsert: {
          _id: artefactId,
          name,
          format: 'file' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )
    storedOk = true

    if (existing?.filePath && existing.filePath !== filePath) {
      await deleteFile(existing.filePath).catch(() => {})
    }

    const artefact = await mongo.artefacts.findOne({ _id: artefactId })
    res.status(201).json({ artefact })
  } catch (err) {
    if (stagingStored) await deleteFile(stagingPath).catch(() => {})
    if (newFilePath && !storedOk) await deleteFile(newFilePath).catch(() => {})
    next(err)
  }
})

// Upload npm artefact (API key or internal secret auth, multipart).
// Each artefact id holds a `tarballs: { [arch]: ... }` map; per-arch upload
// updates one slot, leaves the others alone. `noarch` is the default arch
// for portable builds.
router.post('/npm/:id', async (req, res, next) => {
  const stagingPath = `_staging/${randomUUID()}.tgz`
  let stagingStored = false
  let newTarballPath: string | undefined
  let storedOk = false
  try {
    const isInternal = tryInternalSecret(req)
    let apiKey: Awaited<ReturnType<typeof authenticateApiKey>> | null = null
    if (!isInternal) {
      apiKey = await authenticateApiKey(req)
      if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload npm artefacts')
    }

    const id = safeDecode(req.params.id)
    if (apiKey?.allowedName && apiKey.allowedName !== id) {
      throw httpError(403, `this API key is not allowed to upload "${id}"`)
    }

    const existing = await mongo.artefacts.findOne({ _id: id })
    if (existing?.origin) {
      throw httpError(409, 'this artefact is managed by a remote registry')
    }
    if (existing && existing.format !== 'npm') {
      throw httpError(409, `this artefact already exists as a "${existing.format}" artefact`)
    }

    const { architecture, category: uploadCategory } = await streamTarballUpload(req, (stream) => writeFile(stream, stagingPath))
    stagingStored = true

    const { body: manifestStream } = await readFile(stagingPath)
    const manifest = await extractManifest(manifestStream, {
      maxDecompressedBytes: config.maxDecompressedBytes,
      maxTarEntries: config.maxTarEntries
    })

    if (existing?.packageName && existing.packageName !== manifest.name) {
      throw httpError(409, `package name mismatch: existing artefact tracks "${existing.packageName}", upload manifest says "${manifest.name}"`)
    }

    const category = pickCategory(uploadCategory ?? manifest.category, npmCategories)
    if (apiKey?.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    const arch = architecture || 'noarch'
    const tarballPath = `npm/${id}/${arch}-${randomUUID()}.tgz`
    await moveFile(stagingPath, tarballPath)
    stagingStored = false
    newTarballPath = tarballPath
    const { size } = await fileStats(tarballPath)

    const now = new Date().toISOString()
    const tarballEntry = {
      path: tarballPath,
      size,
      uploadedAt: now,
      uploadedBy: apiKey
        ? { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId }
        : { internal: true }
    }

    await mongo.artefacts.updateOne(
      { _id: id },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          ...(manifest.licence ? { licence: manifest.licence } : {}),
          category,
          [`tarballs.${arch}`]: tarballEntry,
          size,
          updatedAt: now,
          dataUpdatedAt: now
        },
        $setOnInsert: {
          _id: id,
          name: id,
          format: 'npm' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )
    storedOk = true

    // Best-effort delete of the previous occupant of this arch slot.
    const previousPath = (existing as any)?.tarballs?.[arch]?.path
    if (previousPath && previousPath !== tarballPath) {
      await deleteFile(previousPath).catch(() => {})
    }

    const artefact = await mongo.artefacts.findOne({ _id: id })
    res.status(201).json({ artefact })
  } catch (err) {
    if (stagingStored) await deleteFile(stagingPath).catch(() => {})
    if (newTarballPath && !storedOk) await deleteFile(newTarballPath).catch(() => {})
    next(err)
  }
})

// Download raw file
router.get('/:id/download', async (req, res, next) => {
  try {
    const caller = await resolveCaller(req)
    const filter = artefactAccessFilter(caller)
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
    if (!artefact) throw httpError(404, 'artefact not found')
    await assertDownloadAccess(caller, artefact)
    if (artefact.format !== 'file') throw httpError(400, 'this artefact is not a file-format artefact')
    if (!artefact.filePath) throw httpError(404, 'no file uploaded for this artefact')

    const filename = artefact.fileName || artefact.name
    const signedUrl = await getDownloadUrl(artefact.filePath, { filename })
    if (signedUrl) {
      res.redirect(302, signedUrl)
      return
    }

    res.set('Content-Type', 'application/octet-stream')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    const { body, size, lastModified } = await readFile(artefact.filePath, req.get('If-Modified-Since'))
    res.set('Last-Modified', lastModified.toUTCString())
    res.set('Content-Length', String(size))
    await pipeline(body, res).catch((err) => {
      if (!res.headersSent) next(err)
    })
  } catch (err) { next(err) }
})

// Download npm artefact tarball. Optional ?architecture=<x64|arm64|...>
// resolves a specific slot; falls back to `noarch` if the requested arch is
// absent.
router.get('/:id/tarball', async (req, res, next) => {
  try {
    const caller = await resolveCaller(req)
    const filter = artefactAccessFilter(caller)
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
    if (!artefact) throw httpError(404, 'artefact not found')
    if (artefact.format !== 'npm') throw httpError(400, 'this artefact is not an npm-format artefact')
    await assertDownloadAccess(caller, artefact)

    const requestedArch = typeof req.query.architecture === 'string' ? req.query.architecture : undefined
    const tarballs = artefact.tarballs || {}
    const slot = (requestedArch && tarballs[requestedArch]) || tarballs.noarch
    if (!slot) throw httpError(404, 'no tarball for this architecture')

    const filename = `${artefact.name}-${artefact.version || 'tarball'}.tgz`
    const signedUrl = await getDownloadUrl(slot.path, { filename })
    if (signedUrl) {
      res.redirect(302, signedUrl)
      return
    }

    res.set('Content-Type', 'application/gzip')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    const { body, size, lastModified } = await readFile(slot.path, req.get('If-Modified-Since'))
    res.set('Last-Modified', lastModified.toUTCString())
    res.set('Content-Length', String(size))
    await pipeline(body, res).catch((err) => {
      if (!res.headersSent) next(err)
    })
  } catch (err) { next(err) }
})

// Helper: stream a multipart upload containing a tarball to a caller-provided
// sink (typically the configured files-storage backend), collecting the
// `architecture` field if present. Enforces MAX_UPLOAD_BYTES at the busboy layer.
type StreamWriter = (stream: Readable) => Promise<void>

function streamTarballUpload (req: import('express').Request, writer: StreamWriter): Promise<{ architecture?: string, category?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (err: Error | null, result?: { architecture?: string, category?: string }) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(result!)
    }

    let architecture: string | undefined
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
      if (name === 'architecture') architecture = val
      // Optional override for the artefact category. Plugin tarballs from before
      // the registry convention don't carry `package.json#registry.category`,
      // so the migration sends it as a multipart field. New plugins should
      // declare it in package.json.
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
      settle(null, { architecture, category })
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
