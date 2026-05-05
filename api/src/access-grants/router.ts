import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { session } from '@data-fair/lib-express/index.js'
import { reqSessionAuthenticated } from '@data-fair/lib-express/session.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'
import * as postReqBody from '#doc/access-grants/post-req/index.ts'
import { tryInternalSecretWithAccount } from '../auth.ts'

const router = Router()
export default router

// Grant access (superadmin OR internal-service)
//
// TEMPORARY: internal secret is accepted to support the v6.0 first-boot
// migration (sister processings service pushes its legacy access state into
// registry). For non-migration use, prefer the admin UI.
router.post('/', async (req, res, next) => {
  try {
    const internalAuth = tryInternalSecretWithAccount(req)
    let grantedBy: { type: string, id: string, name: string }
    if (internalAuth) {
      grantedBy = { type: 'internal', id: 'internal', name: 'internal-service' }
    } else {
      const sessionState = await session.reqAdminMode(req)
      grantedBy = {
        type: sessionState.account.type,
        id: sessionState.account.id,
        name: sessionState.user.name
      }
    }
    const body = postReqBody.returnValid(req.body, { name: 'body' })

    // Check for existing grant
    const existing = await mongo.accessGrants.findOne({
      'account.type': body.account.type,
      'account.id': body.account.id
    })
    if (existing) throw httpError(409, 'access already granted to this account')

    const now = new Date().toISOString()
    const grant = {
      _id: new ObjectId().toString(),
      account: body.account,
      grantedBy,
      grantedAt: now
    }

    await mongo.accessGrants.insertOne(grant)
    res.status(201).json(grant)
  } catch (err) { next(err) }
})

// List grants (superadmin)
router.get('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const results = await mongo.accessGrants.find({}).toArray()
    res.json({ results, count: results.length })
  } catch (err) { next(err) }
})

// Check my access grant (authenticated user)
router.get('/me', async (req, res, next) => {
  try {
    const sessionState = reqSessionAuthenticated(req)
    const grant = await mongo.accessGrants.findOne({
      'account.type': sessionState.account.type,
      'account.id': sessionState.account.id
    })
    if (!grant) throw httpError(404, 'no access grant for this account')
    res.json(grant)
  } catch (err) { next(err) }
})

// Revoke grant (superadmin)
router.delete('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const result = await mongo.accessGrants.deleteOne({ _id: req.params.id })
    if (result.deletedCount === 0) throw httpError(404, 'access grant not found')
    res.status(204).send()
  } catch (err) { next(err) }
})
