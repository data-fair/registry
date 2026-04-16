import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { session } from '@data-fair/lib-express/index.js'
import { reqSession, reqSessionAuthenticated } from '@data-fair/lib-express/session.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import { hashApiKey, generateApiKey } from '../auth.ts'
import * as postReqBody from '#doc/api-keys/post-req/index.ts'

const router = Router()
export default router

// Create API key
router.post('/', async (req, res, next) => {
  try {
    const body = postReqBody.returnValid(req.body, { name: 'body' })

    if (body.type === 'upload') {
      await session.reqAdminMode(req)
    } else if (body.type === 'read') {
      if (body.allowedName) {
        throw httpError(400, 'allowedName is only valid for upload keys')
      }
      if (body.allowedCategory) {
        throw httpError(400, 'allowedCategory is only valid for upload keys')
      }
      reqSessionAuthenticated(req)
      if (!body.owner) throw httpError(400, 'owner is required for read keys')
      // Check that the account has a grant
      const grant = await mongo.accessGrants.findOne({
        'account.type': body.owner.type,
        'account.id': body.owner.id
      })
      if (!grant) {
        throw httpError(403, 'account does not have granted access')
      }
    }

    const { rawKey, shortId } = generateApiKey()
    const sessionState = reqSessionAuthenticated(req)
    const now = new Date().toISOString()

    const apiKeyDoc = {
      _id: new ObjectId().toString(),
      type: body.type,
      name: body.name,
      shortId,
      hashedKey: hashApiKey(rawKey),
      createdBy: {
        type: sessionState.account.type,
        id: sessionState.account.id,
        name: sessionState.user.name
      },
      createdAt: now,
      ...(body.owner ? { owner: body.owner } : {}),
      ...(body.allowedName ? { allowedName: body.allowedName } : {}),
      ...(body.allowedCategory ? { allowedCategory: body.allowedCategory } : {}),
      ...(body.expiresAt ? { expiresAt: body.expiresAt } : {})
    }

    await mongo.apiKeys.insertOne(apiKeyDoc)

    const { hashedKey, ...response } = apiKeyDoc
    res.status(201).json({ ...response, key: rawKey })
  } catch (err) { next(err) }
})

// List API keys
router.get('/', async (req, res, next) => {
  try {
    const sessionState = reqSession(req)
    const filter: Record<string, unknown> = {}

    if (!sessionState.account) {
      throw httpError(401, 'authentication required')
    }
    filter['owner.type'] = sessionState.account.type
    filter['owner.id'] = sessionState.account.id

    if (req.query.type) {
      if (req.query.type !== 'upload' && req.query.type !== 'read') {
        throw httpError(400, 'invalid type filter')
      }
      filter.type = req.query.type
    }

    const results = await mongo.apiKeys.find(filter, { projection: { hashedKey: 0 } }).toArray()
    res.json({ results, count: results.length })
  } catch (err) { next(err) }
})

// Revoke API key
router.delete('/:id', async (req, res, next) => {
  try {
    const sessionState = reqSessionAuthenticated(req)
    const apiKey = await mongo.apiKeys.findOne({ _id: req.params.id })
    if (!apiKey) throw httpError(404, 'API key not found')

    if (!sessionState.user.adminMode) {
      // Non-admin can only delete their own read keys
      if (apiKey.type !== 'read' || !apiKey.owner ||
          apiKey.owner.type !== sessionState.account.type ||
          apiKey.owner.id !== sessionState.account.id) {
        throw httpError(403, 'not authorized to delete this key')
      }
    }

    await mongo.apiKeys.deleteOne({ _id: req.params.id })
    res.status(204).send()
  } catch (err) { next(err) }
})
