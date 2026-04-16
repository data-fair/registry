import { Router } from 'express'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Busboy from 'busboy'
import { ObjectId } from 'mongodb'
import { session } from '@data-fair/lib-express/index.js'
import { assertReqInternalSecret } from '@data-fair/lib-express/req-origin.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { Artefact } from '#types/artefact/index.ts'
import mongo from '#mongo'
import config from '#config'
import { authenticateApiKey } from '../auth.ts'
import { artefactAccessFilter, assertDownloadAccess } from '../access.ts'
import { writeFile, readFile, getDownloadUrl, deleteFile } from '../files-storage/index.ts'
import { extractManifest, parseSemver, resolveVersionQuery, pruneOldVersions } from './service.ts'
import * as patchReqBody from '#doc/artefacts/patch-req/index.ts'
import { artefactThumbnailRouter } from '../thumbnails/router.ts'

const router = Router()
export default router

router.use('/:id/thumbnail', artefactThumbnailRouter)

const npmCategories = ['processing', 'catalog', 'application', 'other'] as const
const fileCategories = ['tileset', 'maplibre-style', 'other'] as const
const allCategories = [...new Set<string>([...npmCategories, ...fileCategories])]

const MAX_UPLOAD_BYTES = config.maxUploadBytes ?? 500 * 1024 * 1024

const createUploadTmpDir = async () => {
  const base = config.tmpDir || tmpdir()
  await mkdir(base, { recursive: true })
  return mkdtemp(join(base, 'registry-upload-'))
}

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

// List artefacts (filtered by access)
router.get('/', async (req, res, next) => {
  try {
    const filter = await artefactAccessFilter(req)
    const skip = Math.max(0, Math.min(parseInt(req.query.skip as string) || 0, 100000))
    const size = Math.min(parseInt(req.query.size as string) || 10, 100)
    const sort: Record<string, 1 | -1> = req.query.sort === 'name' ? { name: 1 } : { updatedAt: -1 }

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
      filter.format = req.query.format as 'npm' | 'file'
    }

    const [results, count] = await Promise.all([
      mongo.artefacts.find(filter).sort(sort).skip(skip).limit(size).toArray(),
      mongo.artefacts.countDocuments(filter)
    ])
    res.json({ results, count })
  } catch (err) { next(err) }
})

// Get artefact detail + versions
router.get('/:id', async (req, res, next) => {
  try {
    const filter = await artefactAccessFilter(req)
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
    if (!artefact) throw httpError(404, 'artefact not found')

    if (artefact.format === 'file') {
      res.json(artefact)
    } else {
      const versions = await mongo.versions.find({ artefactId: artefact._id })
        .sort({ semverMajor: -1, semverMinor: -1, semverPatch: -1 })
        .toArray()
      res.json({ ...artefact, versions })
    }
  } catch (err) { next(err) }
})

// Update editable metadata (superadmin)
router.patch('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const body = patchReqBody.returnValid(req.body, { name: 'body' })

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

    // Delete DB state first so concurrent GETs fail cleanly with 404,
    // then best-effort remove files.
    if (artefact.format === 'file') {
      await mongo.artefacts.deleteOne({ _id: artefact._id })
      if (artefact.filePath) await deleteFile(artefact.filePath)
    } else {
      const versions = await mongo.versions.find({ artefactId: artefact._id }).toArray()
      await mongo.versions.deleteMany({ artefactId: artefact._id })
      await mongo.artefacts.deleteOne({ _id: artefact._id })
      for (const version of versions) {
        await deleteFile(version.tarballPath)
      }
    }
    await mongo.thumbnails.deleteMany({ artefactId: artefact._id })
    res.status(204).send()
  } catch (err) { next(err) }
})

// Upload version (API key auth, multipart)
router.post('/:name/versions', async (req, res, next) => {
  let tmpDir: string | undefined
  let storedTarballPath: string | undefined
  let storedOk = false
  try {
    const apiKey = await authenticateApiKey(req)
    if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload versions')

    const name = safeDecode(req.params.name)
    if (apiKey.allowedName && apiKey.allowedName !== name) {
      throw httpError(403, `this API key is not allowed to upload "${name}"`)
    }

    tmpDir = await createUploadTmpDir()
    const tmpTarball = join(tmpDir, 'upload.tgz')
    const { architecture } = await streamTarballUpload(req, tmpTarball)

    // Extract manifest from disk (pipeline enforces decompression limits).
    const manifest = await extractManifest(createReadStream(tmpTarball))
    if (manifest.name !== name) {
      throw httpError(400, `package name mismatch: URL says "${name}" but package.json says "${manifest.name}"`)
    }

    const category = pickCategory(manifest.category, npmCategories)
    if (apiKey.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    const semverParts = parseSemver(manifest.version)
    const majorVersion = semverParts.semverMajor
    const artefactId = `${name}@${majorVersion}`

    // Store tarball (streamed from disk, no in-memory buffering).
    const archSuffix = architecture ? `_${architecture}` : ''
    const tarballPath = `${name}/${majorVersion}/${manifest.version}${archSuffix}.tgz`
    await writeFile(createReadStream(tmpTarball), tarballPath)
    storedTarballPath = tarballPath

    // Upsert artefact
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          licence: manifest.licence,
          category,
          ...(manifest.processingConfigSchema ? { processingConfigSchema: manifest.processingConfigSchema } : {}),
          ...(manifest.applicationConfigSchema ? { applicationConfigSchema: manifest.applicationConfigSchema } : {}),
          updatedAt: now
        },
        $setOnInsert: {
          _id: artefactId,
          name,
          format: 'npm' as const,
          majorVersion,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )

    // Create version doc
    const versionId = new ObjectId().toString()
    await mongo.versions.insertOne({
      _id: versionId,
      artefactId,
      version: manifest.version,
      ...(architecture ? { architecture } : {}),
      ...semverParts,
      tarballPath,
      uploadedAt: now,
      uploadedBy: { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId }
    })
    storedOk = true

    // 2-deep retention: keep only the 2 most recent patches per minor branch
    await pruneOldVersions(artefactId, semverParts.semverMajor, semverParts.semverMinor)

    const artefact = await mongo.artefacts.findOne({ _id: artefactId })
    res.status(201).json({ artefact, version: { _id: versionId, version: manifest.version } })
  } catch (err) {
    // If we wrote the file but failed to commit the DB row, clean it up.
    if (storedTarballPath && !storedOk) {
      await deleteFile(storedTarballPath).catch(() => {})
    }
    next(err)
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})

// Resolve version
router.get('/:id/versions/:version', async (req, res, next) => {
  try {
    const filter = await artefactAccessFilter(req)
    const artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
    if (!artefact) throw httpError(404, 'artefact not found')

    const { filter: vFilter, sort } = resolveVersionQuery(artefact._id, req.params.version)
    const version = await mongo.versions.findOne(vFilter, { sort })
    if (!version) throw httpError(404, 'version not found')
    res.json(version)
  } catch (err) { next(err) }
})

// Download tarball
router.get('/:id/versions/:version/tarball', async (req, res, next) => {
  try {
    let artefact

    // Two auth paths: internal secret or session-based
    const secretKey = req.get('x-secret-key')
    if (secretKey) {
      assertReqInternalSecret(req, config.secretKeys.internalServices!)
      artefact = await mongo.artefacts.findOne({ _id: req.params.id })
    } else {
      const filter = await artefactAccessFilter(req)
      artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
      if (artefact) await assertDownloadAccess(req, artefact)
    }

    if (!artefact) throw httpError(404, 'artefact not found')

    const { filter: vFilter, sort } = resolveVersionQuery(artefact._id, req.params.version)
    const version = await mongo.versions.findOne(vFilter, { sort })
    if (!version) throw httpError(404, 'version not found')

    const filename = `${artefact.name}-${version.version}.tgz`
    const signedUrl = await getDownloadUrl(version.tarballPath, { filename })
    if (signedUrl) {
      res.redirect(302, signedUrl)
      return
    }

    res.set('Content-Type', 'application/gzip')
    res.set('Content-Disposition', `attachment; filename="${filename}"`)
    const { body, size } = await readFile(version.tarballPath)
    res.set('Content-Length', String(size))
    await pipeline(body, res).catch((err) => {
      if (!res.headersSent) next(err)
    })
  } catch (err) { next(err) }
})

// Upload raw file (API key auth, multipart)
router.post('/file/:name', async (req, res, next) => {
  let tmpDir: string | undefined
  let newFilePath: string | undefined
  let storedOk = false
  try {
    const apiKey = await authenticateApiKey(req)
    if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload files')

    const name = safeDecode(req.params.name)
    if (apiKey.allowedName && apiKey.allowedName !== name) {
      throw httpError(403, `this API key is not allowed to upload "${name}"`)
    }
    const artefactId = name

    tmpDir = await createUploadTmpDir()
    const tmpFile = join(tmpDir, 'upload.bin')
    const fields = await streamFileUpload(req, tmpFile)

    // Parse optional JSON fields with explicit 400 on malformed input.
    const title = fields.title ? parseLocalizedField(fields.title, 'title') : undefined
    const description = fields.description ? parseLocalizedField(fields.description, 'description') : undefined

    const category = pickCategory(fields.category, fileCategories)
    if (apiKey.allowedCategory && apiKey.allowedCategory !== category) {
      throw httpError(403, `this API key is only allowed to upload "${apiKey.allowedCategory}" artefacts`)
    }

    // Store NEW file first, then DB commit, then delete OLD — avoids a
    // window where the artefact row points at a missing file.
    const existing = await mongo.artefacts.findOne({ _id: artefactId })
    const fileName = fields.fileName || name
    // Namespace new writes with a random suffix so a failed delete of the
    // old file doesn't clobber the fresh one.
    const filePath = `files/${name}/${randomUUID()}-${fileName}`
    await writeFile(createReadStream(tmpFile), filePath)
    newFilePath = filePath

    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          filePath,
          fileName,
          category,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          uploadedBy: { apiKeyId: apiKey._id, apiKeyName: apiKey.name, shortId: apiKey.shortId },
          updatedAt: now
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
    if (newFilePath && !storedOk) {
      await deleteFile(newFilePath).catch(() => {})
    }
    next(err)
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
})

// Download raw file
router.get('/:id/download', async (req, res, next) => {
  try {
    let artefact

    const secretKey = req.get('x-secret-key')
    if (secretKey) {
      assertReqInternalSecret(req, config.secretKeys.internalServices!)
      artefact = await mongo.artefacts.findOne({ _id: req.params.id })
    } else {
      const filter = await artefactAccessFilter(req)
      artefact = await mongo.artefacts.findOne({ _id: req.params.id, ...filter })
      if (artefact) await assertDownloadAccess(req, artefact)
    }

    if (!artefact) throw httpError(404, 'artefact not found')
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

// Helper: stream a multipart upload containing a tarball to disk, collecting
// `architecture` field if present. Enforces MAX_UPLOAD_BYTES at the busboy layer.
function streamTarballUpload (req: import('express').Request, destPath: string): Promise<{ architecture?: string }> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (err: Error | null, result?: { architecture?: string }) => {
      if (settled) return
      settled = true
      if (err) reject(err)
      else resolve(result!)
    }

    let architecture: string | undefined
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
    })

    busboy.on('file', (_name, stream) => {
      if (fileSeen) {
        stream.resume()
        return
      }
      fileSeen = true

      stream.on('limit', () => {
        settle(httpError(413, `upload exceeds ${MAX_UPLOAD_BYTES} bytes`))
        stream.unpipe()
        req.unpipe(busboy)
      })

      pendingWrite = pipeline(stream, createWriteStream(destPath)).catch((err) => {
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
      settle(null, { architecture })
    })

    req.on('aborted', () => settle(httpError(400, 'upload aborted')))
    req.pipe(busboy)
  })
}

// Helper: stream a multipart upload containing a raw file to disk,
// collecting all text fields. Enforces MAX_UPLOAD_BYTES.
function streamFileUpload (req: import('express').Request, destPath: string): Promise<Record<string, string>> {
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
        settle(httpError(413, `upload exceeds ${MAX_UPLOAD_BYTES} bytes`))
        stream.unpipe()
        req.unpipe(busboy)
      })

      pendingWrite = pipeline(stream, createWriteStream(destPath)).catch((err) => {
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
