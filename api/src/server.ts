import { createServer } from 'node:http'
import { session } from '@data-fair/lib-express/index.js'
import { startObserver, stopObserver, internalError } from '@data-fair/lib-node/observer.js'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import locks from '@data-fair/lib-node/locks.js'
import { createHttpTerminator } from 'http-terminator'
import { app } from './app.ts'
import config from '#config'
import mongo from '#mongo'
import { syncAllRemoteRegistries } from './remote-registries/sync.ts'

const server = createServer(app)
const httpTerminator = createHttpTerminator({ server })

server.keepAliveTimeout = (60 * 1000) + 1000
server.headersTimeout = (60 * 1000) + 2000
let syncTimer: ReturnType<typeof setInterval> | undefined

export const start = async () => {
  if (config.observer?.active) await startObserver(config.observer.port)
  session.init(config.privateDirectoryUrl)
  await mongo.init()
  await locks.start(mongo.db)

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
      console.error('[sync] Daily sync error:', err.message || err)
    })
  }, 24 * 60 * 60 * 1000)

  console.log(`API server listening on port ${config.port}`)
}

export const stop = async () => {
  if (syncTimer) clearInterval(syncTimer)
  await httpTerminator.terminate()
  if (config.observer?.active) await stopObserver()
  await locks.stop()
  await mongo.client.close()
}
