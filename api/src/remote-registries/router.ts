import { Router } from 'express'
import { pipeline } from 'node:stream/promises'
import { session } from '@data-fair/lib-express/index.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import mongo from '#mongo'
import { cipher, decipher } from '../cipher.ts'
import { startSync, enqueueArtefactSync } from './sync.ts'
import { filterSuggestedArtefacts, annotateLocalState, syncLockId, syncState } from './operations.ts'
import * as postReqBody from '#doc/remote-registries/post-req/index.ts'
import * as patchReqBody from '#doc/remote-registries/patch-req/index.ts'

const router = Router()
export default router

const extractShortId = (apiKey: string): string => {
  const match = apiKey.match(/^(reg_[^_]+)_/)
  return match ? match[1] : apiKey.slice(0, 12)
}

// One query for the whole page, not one per row.
const lockedLockIds = async (registryIds: string[]): Promise<Set<string>> => {
  if (registryIds.length === 0) return new Set()
  const rows = await mongo.db.collection('locks')
    .find({ _id: { $in: registryIds.map(syncLockId) as any } }, { projection: { _id: 1 } })
    .toArray()
  return new Set(rows.map(row => String(row._id)))
}

// Create remote registry
router.post('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const body = postReqBody.returnValid(req.body, { name: 'body' })

    const existing = await mongo.remoteRegistries.findOne({ _id: body.url })
    if (existing) throw httpError(409, 'a remote registry with this URL already exists')

    const now = new Date().toISOString()
    const doc = {
      _id: body.url,
      name: body.name,
      apiKey: cipher(body.apiKey),
      apiKeyShortId: extractShortId(body.apiKey),
      selectedArtefacts: [] as string[],
      createdAt: now,
      updatedAt: now
    }

    await mongo.remoteRegistries.insertOne(doc)
    const { apiKey, ...response } = doc
    res.status(201).json(response)
  } catch (err) { next(err) }
})

// List remote registries
router.get('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const results = await mongo.remoteRegistries.find({}, { projection: { apiKey: 0 } }).toArray()
    const locked = await lockedLockIds(results.map(r => r._id))
    res.json({
      results: results.map(r => ({ ...r, syncState: syncState(locked.has(syncLockId(r._id)), r) })),
      count: results.length
    })
  } catch (err) { next(err) }
})

// Get remote registry
router.get('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id }, { projection: { apiKey: 0 } })
    if (!doc) throw httpError(404, 'remote registry not found')
    const locked = await lockedLockIds([doc._id])
    res.json({ ...doc, syncState: syncState(locked.has(syncLockId(doc._id)), doc) })
  } catch (err) { next(err) }
})

// Update remote registry
router.patch('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const body = patchReqBody.returnValid(req.body, { name: 'body' })

    const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (body.name) $set.name = body.name
    if (body.apiKey) {
      $set.apiKey = cipher(body.apiKey)
      $set.apiKeyShortId = extractShortId(body.apiKey)
    }

    const result = await mongo.remoteRegistries.findOneAndUpdate(
      { _id: req.params.id },
      { $set },
      { returnDocument: 'after', projection: { apiKey: 0 } }
    )
    if (!result) throw httpError(404, 'remote registry not found')
    res.json(result)
  } catch (err) { next(err) }
})

// Delete remote registry
router.delete('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id })
    if (!doc) throw httpError(404, 'remote registry not found')

    await mongo.remoteRegistries.deleteOne({ _id: req.params.id })
    // Unlock mirrored artefacts
    await mongo.artefacts.updateMany(
      { origin: req.params.id },
      { $unset: { origin: '' } }
    )
    res.status(204).send()
  } catch (err) { next(err) }
})

// Browse remote artefacts
router.get('/:id/remote-artefacts', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id })
    if (!doc) throw httpError(404, 'remote registry not found')

    const apiKey = decipher(doc.apiKey)
    const ax = axiosBuilder({
      baseURL: doc._id,
      headers: { 'x-api-key': apiKey }
    })

    const size = Math.min(parseInt(req.query.size as string) || 100, 100)
    const skip = parseInt(req.query.skip as string) || 0
    // Ask the remote for deprecated artefacts too, then drop the ones that are
    // not already selected — a deprecated artefact is not suggested for new
    // mirroring but stays visible if it is already mirrored.
    const params: Record<string, string> = { size: String(size), skip: String(skip), includeDeprecated: 'true' }
    for (const key of ['q', 'category', 'format'] as const) {
      if (typeof req.query[key] === 'string' && req.query[key]) params[key] = req.query[key] as string
    }

    const remote = await ax.get('/api/v1/artefacts', { params })
    const suggested = filterSuggestedArtefacts(remote.data, doc.selectedArtefacts)
    // One local read for the page: the admin table shows, per row, whether the
    // mirror exists and whether it is behind the upstream.
    const locals = await mongo.artefacts
      .find({ _id: { $in: suggested.results.map((a: { _id: string }) => a._id) } }, { projection: { dataUpdatedAt: 1, origin: 1 } })
      .toArray()
    res.json({ ...suggested, results: annotateLocalState(suggested.results, locals, doc._id) })
  } catch (err) { next(err) }
})

const remoteThumbnailTypes = new Set(['image/webp', 'image/svg+xml'])

// Proxy an upstream thumbnail for the admin's selection table. The upstream
// url is the one the *server* reaches (possibly an internal one), and the
// upstream sets Cross-Origin-Resource-Policy: same-origin on its assets, so the
// browser cannot load them directly.
router.get('/:id/remote-thumbnails/:thumbnailId/data', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id })
    if (!doc) throw httpError(404, 'remote registry not found')
    if (!/^[\w-]+$/.test(req.params.thumbnailId)) throw httpError(400, 'invalid thumbnail id')

    const ax = axiosBuilder({ baseURL: doc._id, headers: { 'x-api-key': decipher(doc.apiKey) } })
    const remote = await ax.get(`/api/v1/thumbnails/${req.params.thumbnailId}/data`, { responseType: 'stream', validateStatus: () => true })
    if (remote.status !== 200) throw httpError(404, 'thumbnail not found')
    // The upstream is another deployment: never relay its Content-Type blindly
    // onto our origin. Only the types a registry stores are accepted, and SVG
    // is served sandboxed so it cannot run scripts if opened as a document.
    const contentType = String(remote.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (!remoteThumbnailTypes.has(contentType)) {
      remote.data.destroy()
      throw httpError(415, 'unsupported thumbnail type')
    }
    res.set('Content-Type', contentType)
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Content-Security-Policy', "default-src 'none'; sandbox")
    if (remote.headers['content-length']) res.set('Content-Length', remote.headers['content-length'])
    // Upstream ids change on every replace, so the bytes behind one id never do.
    res.set('Cache-Control', 'private, max-age=31536000, immutable')
    await pipeline(remote.data, res)
  } catch (err) { next(err) }
})

// Select artefact to mirror
router.post('/:id/selected-artefacts', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const { artefactId } = req.body
    if (!artefactId || typeof artefactId !== 'string') {
      throw httpError(400, 'artefactId is required')
    }

    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id })
    if (!doc) throw httpError(404, 'remote registry not found')

    if (doc.selectedArtefacts.includes(artefactId)) {
      throw httpError(409, 'artefact already selected')
    }

    // Conflict check: local artefact without origin
    const existing = await mongo.artefacts.findOne({ _id: artefactId })
    if (existing && !existing.origin) {
      throw httpError(409, 'a locally-uploaded artefact with this ID already exists')
    }

    await mongo.remoteRegistries.updateOne(
      { _id: req.params.id },
      {
        $addToSet: { selectedArtefacts: artefactId },
        $set: { updatedAt: new Date().toISOString() }
      }
    )
    // Mirror it right away rather than waiting for the daily job or a manual
    // full sync; progress is published on the registry's ws channel.
    await enqueueArtefactSync(req.params.id, artefactId)
    res.status(201).json({ artefactId })
  } catch (err) { next(err) }
})

// Unselect artefact
router.delete('/:id/selected-artefacts/:artefactId', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id })
    if (!doc) throw httpError(404, 'remote registry not found')

    await mongo.remoteRegistries.updateOne(
      { _id: req.params.id },
      {
        $pull: { selectedArtefacts: req.params.artefactId, pendingSync: req.params.artefactId },
        $set: { updatedAt: new Date().toISOString() }
      }
    )
    // Unlock the local artefact
    await mongo.artefacts.updateOne(
      { _id: req.params.artefactId, origin: req.params.id },
      { $unset: { origin: '' } }
    )
    res.status(204).send()
  } catch (err) { next(err) }
})

// Trigger sync
router.post('/:id/sync', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id })
    if (!doc) throw httpError(404, 'remote registry not found')

    if (!await startSync(req.params.id)) throw httpError(409, 'sync already running')
    res.status(202).json({ message: 'sync started' })
  } catch (err) { next(err) }
})
