import { resolve } from 'node:path'
import { session, errorHandler, createSiteMiddleware, createSpaMiddleware } from '@data-fair/lib-express/index.js'
import express from 'express'
import helmet from 'helmet'
import { uiConfig } from './ui-config.ts'
import adminRouter from './admin/router.ts'
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
app.use('/api/ping', (req, res) => res.send('ok'))

if (process.env.NODE_ENV === 'development') {
  app.delete('/api/test-env', async (req, res) => {
    // cleanup test data - will be expanded in Phase 2
    res.send()
  })
}

app.use('/api', (req, res) => res.status(404).send('unknown api endpoint'))

app.use(await createSpaMiddleware(resolve(import.meta.dirname, '../../ui/dist'), uiConfig, {
  csp: { nonce: true, header: true },
  privateDirectoryUrl: config.privateDirectoryUrl
}))

app.use(errorHandler)
