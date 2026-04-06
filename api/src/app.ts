import { resolve } from 'node:path'
import { session, errorHandler, createSiteMiddleware, createSpaMiddleware } from '@data-fair/lib-express/index.js'
import express from 'express'
import helmet from 'helmet'
import { uiConfig } from './ui-config.ts'
import adminRouter from './admin/router.ts'
import artefactsRouter from './artefacts/router.ts'
import apiKeysRouter from './api-keys/router.ts'
import accessGrantsRouter from './access-grants/router.ts'
import mongo from '#mongo'
import { cleanFiles } from './files-storage/index.ts'
import config from '#config'

export const app = express()

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'frame-ancestors': ["'none'"],
      'default-src': ["'none'"]
    }
  }
}))

app.set('query parser', 'simple')
app.use(createSiteMiddleware('registry'))
app.use(session.middleware())

app.use(express.json({ limit: '1mb' }))

app.use('/api/admin', adminRouter)
app.use('/api/v1/artefacts', artefactsRouter)
app.use('/api/v1/api-keys', apiKeysRouter)
app.use('/api/v1/access-grants', accessGrantsRouter)
app.use('/api/ping', (req, res) => res.send('ok'))

if (process.env.NODE_ENV === 'development') {
  app.delete('/api/test-env', async (req, res) => {
    await mongo.artefacts.deleteMany({})
    await mongo.versions.deleteMany({})
    await mongo.apiKeys.deleteMany({})
    await mongo.accessGrants.deleteMany({})
    await cleanFiles()
    res.send()
  })
}

app.use('/api', (req, res) => res.status(404).send('unknown api endpoint'))

app.use(await createSpaMiddleware(resolve(import.meta.dirname, '../../ui/dist'), uiConfig, {
  csp: { nonce: true, header: true },
  privateDirectoryUrl: config.privateDirectoryUrl
}))

app.use(errorHandler)
