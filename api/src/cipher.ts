import config from '#config'
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

export type CipheredContent = { iv: string, alg: 'aes256', data: string }

const hash = createHash('sha256')
hash.update(config.secretKeys.cipherPassword)
const securityKey = hash.digest()

export const cipher = (content: string): CipheredContent => {
  const initVector = randomBytes(16)
  const algo = 'aes256'
  const c = createCipheriv(algo, securityKey, initVector)
  let encryptedData = c.update(content, 'utf-8', 'hex')
  encryptedData += c.final('hex')
  return {
    iv: initVector.toString('hex'),
    alg: algo,
    data: encryptedData
  }
}

export const decipher = (cipheredContent: CipheredContent | string): string => {
  if (typeof cipheredContent === 'string') return cipheredContent
  const d = createDecipheriv(cipheredContent.alg, securityKey, Buffer.from(cipheredContent.iv, 'hex'))
  let content = d.update(cipheredContent.data, 'hex', 'utf-8')
  content += d.final('utf8')
  return content
}
