import { createHash, randomBytes } from 'node:crypto'
import type { Request } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'

export const hashApiKey = (key: string) =>
  createHash('sha512').update(key).digest('hex')

const hashApiKeyLegacy = (key: string) =>
  createHash('sha256').update(key).digest('hex')

export const generateApiKey = () =>
  randomBytes(32).toString('hex')

export const authenticateApiKey = async (req: Request) => {
  const key = req.get('x-api-key')
  if (!key) throw httpError(401, 'missing x-api-key header')

  // Try SHA-512 (current)
  const hashedKey = hashApiKey(key)
  let apiKey = await mongo.apiKeys.findOne({ hashedKey })
  if (apiKey) return apiKey

  // Fall back to SHA-256 (legacy) and migrate transparently
  const legacyHash = hashApiKeyLegacy(key)
  apiKey = await mongo.apiKeys.findOne({ hashedKey: legacyHash })
  if (apiKey) {
    await mongo.apiKeys.updateOne({ _id: apiKey._id }, { $set: { hashedKey } })
    return apiKey
  }

  throw httpError(401, 'invalid API key')
}
