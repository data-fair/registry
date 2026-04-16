import { Router } from 'express'
import { session } from '@data-fair/lib-express/index.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import mongo from '#mongo'
import { cipher, decipher } from '../cipher.ts'
import { syncRemoteRegistry } from './sync.ts'
import * as postReqBody from '#doc/remote-registries/post-req/index.ts'
import * as patchReqBody from '#doc/remote-registries/patch-req/index.ts'

const router = Router()
export default router

const extractShortId = (apiKey: string): string => {
  const match = apiKey.match(/^(reg_[^_]+)_/)
  return match ? match[1] : apiKey.slice(0, 12)
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
    res.json({ results, count: results.length })
  } catch (err) { next(err) }
})

// Get remote registry
router.get('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id }, { projection: { apiKey: 0 } })
    if (!doc) throw httpError(404, 'remote registry not found')
    res.json(doc)
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
    const params: Record<string, string> = { size: String(size), skip: String(skip) }
    if (req.query.q) params.q = req.query.q as string

    const remote = await ax.get('/api/v1/artefacts', { params })
    res.json(remote.data)
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
        $pull: { selectedArtefacts: req.params.artefactId },
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

    syncRemoteRegistry(req.params.id).catch(err => {
      console.error(`[sync] Manual sync error for ${req.params.id}:`, err.message || err)
    })
    res.status(202).json({ message: 'sync started' })
  } catch (err) { next(err) }
})
