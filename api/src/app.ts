import { resolve } from 'node:path'
import { session, errorHandler, createSiteMiddleware, createSpaMiddleware } from '@data-fair/lib-express/index.js'
import { assertReqInternal } from '@data-fair/lib-express/req-origin.js'
import express from 'express'
import helmet from 'helmet'
import { uiConfig } from './ui-config.ts'
import adminRouter from './admin/router.ts'
import artefactsRouter from './artefacts/router.ts'
import apiKeysRouter from './api-keys/router.ts'
import accessGrantsRouter from './access-grants/router.ts'
import { publicThumbnailsRouter } from './thumbnails/router.ts'
import remoteRegistriesRouter from './remote-registries/router.ts'
import mongo from '#mongo'
import { cleanFiles } from './files-storage/index.ts'
import { backfillSize } from './upgrades/backfill-size.ts'
import { backfillDataUpdatedAt } from './upgrades/backfill-data-updated-at.ts'
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
app.use('/api/v1/thumbnails', publicThumbnailsRouter)
app.use('/api/v1/remote-registries', remoteRegistriesRouter)
app.use('/api/ping', (req, res) => res.send('ok'))

if (process.env.NODE_ENV === 'development') {
  app.delete('/api/test-env', async (req, res) => {
    assertReqInternal(req)
    await mongo.artefacts.deleteMany({})
    await mongo.versions.deleteMany({})
    await mongo.apiKeys.deleteMany({})
    await mongo.accessGrants.deleteMany({})
    await mongo.thumbnails.deleteMany({})
    await mongo.remoteRegistries.deleteMany({})
    await cleanFiles()
    res.send()
  })

  app.put('/api/test-env/artefacts/:id/origin', async (req, res) => {
    assertReqInternal(req)
    const { origin } = req.body
    if (origin) {
      await mongo.artefacts.updateOne({ _id: req.params.id }, { $set: { origin } })
    } else {
      await mongo.artefacts.updateOne({ _id: req.params.id }, { $unset: { origin: '' } })
    }
    res.send()
  })

  // TODO: remove with backfill-size upgrade
  app.post('/api/test-env/backfill-size/reset', async (req, res) => {
    assertReqInternal(req)
    await mongo.artefacts.updateMany({}, { $unset: { size: '' } })
    await mongo.versions.updateMany({}, { $unset: { size: '' } })
    res.send()
  })

  // TODO: remove with backfill-size upgrade
  app.post('/api/test-env/backfill-size/run', async (req, res) => {
    assertReqInternal(req)
    await backfillSize()
    res.send()
  })

  // TODO: remove with backfill-data-updated-at upgrade
  app.post('/api/test-env/backfill-data-updated-at/reset', async (req, res) => {
    assertReqInternal(req)
    await mongo.artefacts.updateMany({}, { $unset: { dataUpdatedAt: '' } })
    res.send()
  })

  // TODO: remove with backfill-data-updated-at upgrade
  app.post('/api/test-env/backfill-data-updated-at/run', async (req, res) => {
    assertReqInternal(req)
    await backfillDataUpdatedAt()
    res.send()
  })
}

app.use('/api', (req, res) => res.status(404).send('unknown api endpoint'))

app.use(await createSpaMiddleware(resolve(import.meta.dirname, '../../ui/dist'), uiConfig, {
  csp: { nonce: true, header: true },
  privateDirectoryUrl: config.privateDirectoryUrl
}))

app.use(errorHandler)
