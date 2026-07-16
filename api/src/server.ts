import { createServer } from 'node:http'
import { session } from '@data-fair/lib-express/index.js'
import { startObserver, stopObserver, internalError } from '@data-fair/lib-node/observer.js'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import locks from '@data-fair/lib-node/locks.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import * as wsServer from '@data-fair/lib-express/ws-server.js'
import { createHttpTerminator } from 'http-terminator'
import { app } from './app.ts'
import config from '#config'
import mongo from '#mongo'
import { syncAllRemoteRegistries } from './remote-registries/sync.ts'
import { rescanAll } from './scanning/service.ts'
import { renameFilePathToPath } from './boot-rename-file-path.ts'

const server = createServer(app)
const httpTerminator = createHttpTerminator({ server })

server.keepAliveTimeout = (60 * 1000) + 1000
server.headersTimeout = (60 * 1000) + 2000
// Large artefact uploads (tilesets, etc.) can easily exceed Node's 5 min default.
server.requestTimeout = 60 * 60 * 1000

server.on('timeout', () => internalError('http-timeout', 'http socket timeout'))
server.on('clientError', (err) => internalError('http-client-error', err))
let syncTimer: ReturnType<typeof setInterval> | undefined
let rescanTimer: ReturnType<typeof setInterval> | undefined

export const start = async () => {
  if (config.observer?.active) await startObserver(config.observer.port)
  session.init(config.privateDirectoryUrl)
  await mongo.init()
  await renameFilePathToPath(mongo.db)
  await locks.start(mongo.db)
  await wsEmitter.init(mongo.db)
  // `canSubscribe` is never reached for admins: ws-server short-circuits on
  // sessionState.user?.adminMode before calling it. Remote-registry sync is an
  // admin-only surface, so returning false refuses precisely everyone else.
  await wsServer.start(server, mongo.db, async () => false)

  if (config.privateEventsUrl) {
    if (!config.secretKeys?.events) {
      internalError('registry', 'Missing secretKeys.events in config')
    } else {
      await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events })
    }
  }

  server.listen(config.port)
  await eventPromise(server, 'listening')

  // Daily sync of all remote registries
  syncTimer = setInterval(() => {
    syncAllRemoteRegistries().catch(err => {
      internalError('daily-sync', err)
    })
  }, 24 * 60 * 60 * 1000)

  if (config.scanning?.enabled) {
    // Warm the DB + do an initial pass shortly after boot, then on the interval.
    rescanAll().catch(err => internalError('rescan-all', err))
    rescanTimer = setInterval(() => {
      rescanAll().catch(err => internalError('rescan-all', err))
    }, (config.scanning.rescanIntervalHours ?? 24) * 60 * 60 * 1000)
  }

  console.log(`API server listening on port ${config.port}`)
}

export const stop = async () => {
  if (syncTimer) clearInterval(syncTimer)
  if (rescanTimer) clearInterval(rescanTimer)
  await httpTerminator.terminate()
  await wsServer.stop()
  if (config.observer?.active) await stopObserver()
  await locks.stop()
  await mongo.client.close()
}
