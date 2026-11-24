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
import { syncLockId } from './remote-registries/operations.ts'
import mongo from '#mongo'
import { filesStorage } from './files-storage/index.ts'
import config from '#config'
import apiDocs from '../contract/api-docs.ts'

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

// public, read by data-fair (private url, no forwarded headers) to merge it into its platform document
app.get('/api/v1/api-docs.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300')
  res.vary('Accept-Language')
  res.json(apiDocs(req.acceptsLanguages('fr', 'en') === 'en' ? 'en' : 'fr'))
})

app.use('/api/admin', adminRouter)
app.use('/api/v1/artefacts', artefactsRouter)
app.use('/api/v1/api-keys', apiKeysRouter)
app.use('/api/v1/access-grants', accessGrantsRouter)
app.use('/api/v1/thumbnails', publicThumbnailsRouter)
app.use('/api/v1/remote-registries', remoteRegistriesRouter)
app.use('/api/ping', (req, res) => res.send('ok'))

// test_<suite>_, the prefix of a test sub-space
const testPrefixRegexp = /^test_[a-z0-9]+(?:_[a-z0-9]+)*_$/

if (process.env.NODE_ENV === 'development') {
  // Prefixed test sub-spaces: a test suite owns the accounts whose ids start with its own prefix (test_<suite>_)
  // and what they own here, plus the global objects it names with that prefix. Several suites share one
  // registry: the clean of one prefix never touches the others, nor the unprefixed dev data.
  // DELETE /api/test-env?prefix=test_<suite>_ removes:
  // - the artefacts whose id starts with the prefix, optionally after an @ (`@test_<suite>_x/pkg@1`,
  //   `test_<suite>_file`), with their tarballs, thumbnails, scans and scan locks;
  // - the api keys created by or owned by the prefix's accounts, and their access grants;
  // - the remote registries whose name starts with the prefix, with their sync locks.
  // Not restricted to internal calls, unlike the other test-env routes: a dev environment running several
  // services cleans a prefix on each one's public path. It only ever deletes what the prefix names.
  app.delete('/api/test-env', async (req, res) => {
    const prefix = req.query.prefix
    if (typeof prefix !== 'string' || !testPrefixRegexp.test(prefix)) {
      res.status(400).send('invalid test prefix')
      return
    }
    // the prefix only holds [a-z0-9_], safe in a regexp
    const accountFilter = new RegExp('^' + prefix)
    const artefacts = await mongo.artefacts.find({ _id: new RegExp('^@?' + prefix) }, { projection: { _id: 1, path: 1 } }).toArray()
    const artefactIds = artefacts.map(a => a._id)
    for (const artefact of artefacts) {
      if (artefact.path) await filesStorage.delete(artefact.path)
    }
    await mongo.artefacts.deleteMany({ _id: { $in: artefactIds } })
    await mongo.artefactScans.deleteMany({ _id: { $in: artefactIds } })
    await mongo.thumbnails.deleteMany({ artefactId: { $in: artefactIds } })
    await mongo.apiKeys.deleteMany({ $or: [{ 'createdBy.id': accountFilter }, { 'owner.id': accountFilter }] })
    await mongo.accessGrants.deleteMany({ 'account.id': accountFilter })
    const remoteRegistries = await mongo.remoteRegistries.find({ name: accountFilter }, { projection: { _id: 1 } }).toArray()
    await mongo.remoteRegistries.deleteMany({ _id: { $in: remoteRegistries.map(r => r._id) } })
    const lockIds = [...artefactIds.map(id => `scan-${id}`), ...remoteRegistries.map(r => syncLockId(r._id))]
    await mongo.db.collection('locks').deleteMany({ _id: { $in: lockIds as any[] } })
    res.status(204).send()
  })

  // raw documents, for the specs of the clean itself (tests/test-env.api.spec.ts)
  app.post('/api/test-env/docs/:collection', async (req, res) => {
    assertReqInternal(req)
    await mongo.db.collection(req.params.collection).insertOne(req.body)
    res.status(201).send()
  })

  app.get('/api/test-env/docs/:collection/:id', async (req, res) => {
    assertReqInternal(req)
    res.json(await mongo.db.collection(req.params.collection).findOne({ _id: req.params.id as any }))
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

  // Hold a lock under a FOREIGN pid so the API process can neither release nor prolong it.
  // Lets a test observe `running` deterministically instead of racing a real sync.
  // The row still expires on its own via the locks TTL index if a test forgets to clean up.
  app.put('/api/test-env/locks/:id', async (req, res) => {
    assertReqInternal(req)
    const now = new Date()
    await mongo.db.collection('locks').insertOne({
      _id: req.params.id as any,
      pid: 'test-env',
      hostname: 'test-env',
      createdAt: now,
      updatedAt: now
    })
    res.send()
  })

  app.delete('/api/test-env/locks/:id', async (req, res) => {
    assertReqInternal(req)
    await mongo.db.collection('locks').deleteOne({ _id: req.params.id as any })
    res.send()
  })

  app.get('/api/test-env/locks/:id', async (req, res) => {
    assertReqInternal(req)
    const lock = await mongo.db.collection('locks').findOne({ _id: req.params.id as any })
    res.json({ exists: !!lock })
  })

  app.put('/api/test-env/artefacts/:id/scan', async (req, res) => {
    assertReqInternal(req)
    const id = decodeURIComponent(req.params.id)
    const { summary, findings } = req.body
    await mongo.artefacts.updateOne(
      { _id: id },
      { $set: { scan: { status: 'success', finishedAt: new Date().toISOString(), summary } } }
    )
    await mongo.artefactScans.replaceOne(
      { _id: id },
      { scannedAt: new Date().toISOString(), scannerVersion: 'test', vulnerabilities: findings ?? [] },
      { upsert: true }
    )
    res.send()
  })

  // Upsert an artefact doc directly with arbitrary fields — lets tests build a
  // deterministic fleet (with controlled scan state) without the upload
  // pipeline, whose auto-scan would otherwise race injected state.
  app.put('/api/test-env/artefacts/:id/doc', async (req, res) => {
    assertReqInternal(req)
    const id = decodeURIComponent(req.params.id)
    const now = new Date().toISOString()
    await mongo.artefacts.replaceOne(
      { _id: id },
      {
        _id: id,
        name: id,
        format: 'npm',
        public: false,
        privateAccess: [],
        createdAt: now,
        updatedAt: now,
        dataUpdatedAt: now,
        ...req.body
      } as any,
      { upsert: true }
    )
    res.send()
  })
}

app.use('/api', (req, res) => res.status(404).send('unknown api endpoint'))

app.use(await createSpaMiddleware(resolve(import.meta.dirname, '../../ui/dist'), uiConfig, {
  csp: { nonce: true, header: true },
  privateDirectoryUrl: config.privateDirectoryUrl
}))

app.use(errorHandler)
