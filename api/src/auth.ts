import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { reqIsInternal } from '@data-fair/lib-express/req-origin.js'
import { reqSession } from '@data-fair/lib-express/session.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import mongo from '#mongo'
import type { Caller } from './access.ts'

export const hashApiKey = (key: string) =>
  createHmac('sha512', config.secretKeys.apiKeysSalt).update(key).digest('hex')

export const generateApiKey = () => {
  const shortId = randomBytes(6).toString('base64url').slice(0, 8)
  const secret = randomBytes(32).toString('hex')
  return { rawKey: `reg_${shortId}_${secret}`, shortId }
}

export const authenticateApiKey = async (req: Request) => {
  const key = req.get('x-api-key')
  if (!key) throw httpError(401, 'missing x-api-key header')

  const hashedKey = hashApiKey(key)
  const apiKey = await mongo.apiKeys.findOne({ hashedKey })
  if (!apiKey) throw httpError(401, 'invalid API key')

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    throw httpError(401, 'API key has expired')
  }

  mongo.apiKeys.updateOne(
    { _id: apiKey._id },
    { $set: { lastUsedAt: new Date().toISOString() } }
  ).catch(() => {})

  return apiKey
}

export interface InternalAccount {
  type: 'user' | 'organization'
  id: string
  department?: string
}

export type InternalAuthResult =
  | null                                    // no internal-secret credentials
  | { account: null }                       // valid secret, no account scoping (full bypass — legacy admin path)
  | { account: InternalAccount }            // valid secret, scoped to a specific account

/**
 * Validate `x-secret-key` and optionally parse `x-account` to derive the
 * caller's account context.
 *
 * - Returns `null` when there is no internal-secret header at all (or it's
 *   invalid). The caller should fall through to other auth modes.
 * - Returns `{ account: null }` when the secret is valid but no `x-account`
 *   is set. This preserves the historical full-bypass behaviour for
 *   internal admin tasks.
 * - Returns `{ account }` when the secret is valid AND a well-formed
 *   `x-account` is present. The caller must then enforce access-grants for
 *   that account before serving artefact data.
 *
 * Throws 400 on a malformed `x-account` header (so a bug in the caller
 * surfaces loudly rather than silently falling back to bypass).
 */
export const tryInternalSecretWithAccount = (req: Request): InternalAuthResult => {
  if (!reqIsInternal(req)) return null
  const secretKey = req.get('x-secret-key')
  if (!secretKey || !config.secretKeys.internalServices) return null
  const received = Buffer.from(secretKey, 'utf-8')
  const expected = Buffer.from(config.secretKeys.internalServices, 'utf-8')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null

  const accountHeader = req.get('x-account')
  if (!accountHeader) return { account: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(accountHeader)
  } catch {
    throw httpError(400, 'invalid x-account header: not JSON')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw httpError(400, 'invalid x-account header: not an object')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.type !== 'user' && obj.type !== 'organization') {
    throw httpError(400, 'invalid x-account header: type must be "user" or "organization"')
  }
  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    throw httpError(400, 'invalid x-account header: id must be a non-empty string')
  }
  if (obj.department !== undefined && typeof obj.department !== 'string') {
    throw httpError(400, 'invalid x-account header: department must be a string when set')
  }
  return {
    account: {
      type: obj.type,
      id: obj.id,
      ...(obj.department ? { department: obj.department } : {})
    }
  }
}

/**
 * Resolve the caller's access context across all auth paths in one place.
 * Order of precedence: internal secret → read API key → session.
 *
 * The returned `Caller` is the only thing the artefact endpoints need to
 * decide what's listable and what's downloadable — there is no longer a
 * separate "*ForAccount" code path per auth flavour.
 */
export const resolveCaller = async (req: Request): Promise<Caller> => {
  const internal = tryInternalSecretWithAccount(req)
  if (internal) {
    if (internal.account === null) return { admin: true }
    return { admin: false, account: internal.account }
  }
  const readAuth = await tryAuthenticateReadKey(req)
  if (readAuth) return { admin: false, account: readAuth.owner }
  const session = reqSession(req)
  if (session.user?.adminMode) return { admin: true }
  if (session.account) return { admin: false, account: session.account }
  return { admin: false }
}

export const tryAuthenticateReadKey = async (req: Request) => {
  const key = req.get('x-api-key')
  if (!key) return null

  const hashedKey = hashApiKey(key)
  const apiKey = await mongo.apiKeys.findOne({ hashedKey })
  if (!apiKey) throw httpError(401, 'invalid API key')

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    throw httpError(401, 'API key has expired')
  }

  if (apiKey.type !== 'read') return null
  if (!apiKey.owner) throw httpError(400, 'read key missing owner')

  mongo.apiKeys.updateOne(
    { _id: apiKey._id },
    { $set: { lastUsedAt: new Date().toISOString() } }
  ).catch(() => {})

  return { apiKey, owner: apiKey.owner }
}
