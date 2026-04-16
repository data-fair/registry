import { createHmac, randomBytes } from 'node:crypto'
import type { Request } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import config from '#config'
import mongo from '#mongo'

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
