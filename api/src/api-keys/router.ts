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
    } else if (body.type === 'federation') {
      const sessionState = reqSessionAuthenticated(req)
      if (!body.owner) throw httpError(400, 'owner is required for federation keys')
      // Check that the account has a grant
      const grant = await mongo.accessGrants.findOne({
        'account.type': body.owner.type,
        'account.id': body.owner.id
      })
      if (!grant && !sessionState.user.adminMode) {
        throw httpError(403, 'account does not have granted access')
      }
    }

    const rawKey = generateApiKey()
    const sessionState = reqSessionAuthenticated(req)
    const now = new Date().toISOString()

    const apiKeyDoc = {
      _id: new ObjectId().toString(),
      type: body.type,
      name: body.name,
      hashedKey: hashApiKey(rawKey),
      createdBy: {
        type: sessionState.account.type,
        id: sessionState.account.id,
        name: sessionState.user.name
      },
      createdAt: now,
      ...(body.owner ? { owner: body.owner } : {})
    }

    await mongo.apiKeys.insertOne(apiKeyDoc)

    // Return the raw key only once — it's never stored
    const { hashedKey, ...response } = apiKeyDoc
    res.status(201).json({ ...response, key: rawKey })
  } catch (err) { next(err) }
})

// List API keys
router.get('/', async (req, res, next) => {
  try {
    const sessionState = reqSession(req)
    let filter = {}

    if (sessionState.user?.adminMode) {
      // superadmin sees all
    } else if (sessionState.account) {
      // federation key owners see their own
      filter = { 'owner.type': sessionState.account.type, 'owner.id': sessionState.account.id }
    } else {
      throw httpError(401, 'authentication required')
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
      // Non-admin can only delete their own federation keys
      if (apiKey.type !== 'federation' || !apiKey.owner ||
          apiKey.owner.type !== sessionState.account.type ||
          apiKey.owner.id !== sessionState.account.id) {
        throw httpError(403, 'not authorized to delete this key')
      }
    }

    await mongo.apiKeys.deleteOne({ _id: req.params.id })
    res.status(204).send()
  } catch (err) { next(err) }
})
