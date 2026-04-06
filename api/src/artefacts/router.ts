import { Router } from 'express'
import { Readable } from 'node:stream'
import Busboy from 'busboy'
import { ObjectId } from 'mongodb'
import { session } from '@data-fair/lib-express/index.js'
import { assertReqInternalSecret } from '@data-fair/lib-express/req-origin.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import config from '#config'
import { authenticateApiKey } from '../auth.ts'
import { artefactAccessFilter, assertDownloadAccess } from '../access.ts'
import { writeTarball, readTarball, deleteTarball } from '../files-storage/index.ts'
import { extractManifest, parseSemver, resolveVersionQuery, pruneOldVersions } from './service.ts'
import * as patchReqBody from '#doc/artefacts/patch-req/index.ts'

const router = Router()
export default router

// List artefacts (filtered by access)
router.get('/', async (req, res, next) => {
  try {
    const filter = await artefactAccessFilter(req)
    const skip = parseInt(req.query.skip as string) || 0
    const size = Math.min(parseInt(req.query.size as string) || 10, 100)
    const sort: Record<string, 1 | -1> = req.query.sort === 'name' ? { name: 1 } : { updatedAt: -1 }

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

    const versions = await mongo.versions.find({ artefactId: artefact._id })
      .sort({ semverMajor: -1, semverMinor: -1, semverPatch: -1 })
      .toArray()

    res.json({ ...artefact, versions })
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

    // Delete tarballs
    const versions = await mongo.versions.find({ artefactId: artefact._id }).toArray()
    for (const version of versions) {
      await deleteTarball(version.tarballPath)
    }

    await mongo.versions.deleteMany({ artefactId: artefact._id })
    await mongo.artefacts.deleteOne({ _id: artefact._id })
    res.status(204).send()
  } catch (err) { next(err) }
})

// Upload version (API key auth, multipart)
router.post('/:name/versions', async (req, res, next) => {
  try {
    const apiKey = await authenticateApiKey(req)
    if (apiKey.type !== 'upload') throw httpError(403, 'only upload API keys can upload versions')

    const name = decodeURIComponent(req.params.name)

    // Parse multipart: expect a single file field
    const { fileStream, architecture } = await parseUpload(req)

    // Buffer the tarball so we can both parse and store it
    const chunks: Buffer[] = []
    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer)
    }
    const tarballBuffer = Buffer.concat(chunks)

    // Extract manifest from tarball
    const manifest = await extractManifest(Readable.from(tarballBuffer))
    if (manifest.name !== name) {
      throw httpError(400, `package name mismatch: URL says "${name}" but package.json says "${manifest.name}"`)
    }

    const semverParts = parseSemver(manifest.version)
    const majorVersion = semverParts.semverMajor
    const artefactId = `${name}@${majorVersion}`

    // Store tarball
    const archSuffix = architecture ? `_${architecture}` : ''
    const tarballPath = `${name}/${majorVersion}/${manifest.version}${archSuffix}.tgz`
    await writeTarball(Readable.from(tarballBuffer), tarballPath)

    // Upsert artefact
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          licence: manifest.licence,
          category: (manifest.category || 'other') as 'processing' | 'catalog' | 'application' | 'other',
          ...(manifest.processingConfigSchema ? { processingConfigSchema: manifest.processingConfigSchema } : {}),
          ...(manifest.applicationConfigSchema ? { applicationConfigSchema: manifest.applicationConfigSchema } : {}),
          updatedAt: now
        },
        $setOnInsert: {
          _id: artefactId,
          name,
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
      uploadedAt: now
    })

    // 2-deep retention: keep only the 2 most recent patches per minor branch
    await pruneOldVersions(artefactId, semverParts.semverMajor, semverParts.semverMinor)

    const artefact = await mongo.artefacts.findOne({ _id: artefactId })
    res.status(201).json({ artefact, version: { _id: versionId, version: manifest.version } })
  } catch (err) { next(err) }
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
    const secretKey = req.get('x-secret-key') || (typeof req.query.key === 'string' ? req.query.key : undefined)
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

    res.set('Content-Type', 'application/gzip')
    res.set('Content-Disposition', `attachment; filename="${artefact.name}-${version.version}.tgz"`)
    const stream = await readTarball(version.tarballPath)
    stream.pipe(res)
  } catch (err) { next(err) }
})

// Helper: parse multipart upload
function parseUpload (req: import('express').Request): Promise<{ fileStream: Readable, architecture?: string }> {
  return new Promise((resolve, reject) => {
    let architecture: string | undefined
    const busboy = Busboy({ headers: req.headers })

    busboy.on('field', (name: string, val: string) => {
      if (name === 'architecture') architecture = val
    })

    busboy.on('file', (_name: string, stream: Readable) => {
      resolve({ fileStream: stream, architecture })
    })

    busboy.on('error', reject)
    busboy.on('finish', () => {
      reject(httpError(400, 'no file provided in upload'))
    })

    req.pipe(busboy)
  })
}
