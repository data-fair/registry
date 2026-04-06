import { createHash, randomBytes } from 'node:crypto'
import type { Request } from 'express'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import mongo from '#mongo'

export const hashApiKey = (key: string) =>
  createHash('sha256').update(key).digest('hex')

export const generateApiKey = () =>
  randomBytes(32).toString('hex')

export const authenticateApiKey = async (req: Request) => {
  const key = req.get('x-api-key')
  if (!key) throw httpError(401, 'missing x-api-key header')
  const hashedKey = hashApiKey(key)
  const apiKey = await mongo.apiKeys.findOne({ hashedKey })
  if (!apiKey) throw httpError(401, 'invalid API key')
  return apiKey
}
