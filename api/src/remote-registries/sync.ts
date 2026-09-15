import { randomUUID } from 'node:crypto'
import { Binary } from 'mongodb'
import locks from '@data-fair/lib-node/locks.js'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import type { AxiosInstance } from 'axios'
import mongo from '#mongo'
import { decipher } from '../cipher.ts'
import { filesStorage } from '../files-storage/index.ts'
import type { Artefact } from '#types/artefact/index.ts'
import { syncLockId, syncChannel } from './operations.ts'

export type SyncEvent = {
  running: boolean
  startedAt: string
  done: number
  total: number
  currentArtefact?: string
  lastSyncAt?: string
  lastSyncStatus?: 'success' | 'error'
  lastSyncError?: string
}

// A dropped progress frame is cosmetic — the next frame supersedes it — so an emit
// failure must never abort a sync.
const emitSync = async (remoteRegistryId: string, event: SyncEvent) => {
  try {
    await wsEmitter.emit(syncChannel(remoteRegistryId), event)
  } catch (err) {
    internalError('sync-ws-emit', err)
  }
}

type RemoteThumbnail = NonNullable<Artefact['thumbnail']>

// Mirror the upstream thumbnail, keeping its id: a thumbnail's id changes on
// every replace upstream, so comparing ids is enough to know whether the local
// copy is current. Runs after the artefact doc exists locally, and outside the
// tarball fast path — a thumbnail change never bumps dataUpdatedAt.
const syncThumbnail = async (
  ax: AxiosInstance,
  artefactId: string,
  remoteThumbnail: RemoteThumbnail | undefined,
  localThumbnail: RemoteThumbnail | undefined
) => {
  if (remoteThumbnail?.id === localThumbnail?.id) return
  if (!remoteThumbnail) {
    await mongo.thumbnails.deleteMany({ artefactId })
    await mongo.artefacts.updateOne({ _id: artefactId }, { $unset: { thumbnail: '' } })
    return
  }
  const res = await ax.get(`/api/v1/thumbnails/${remoteThumbnail.id}/data`, { responseType: 'arraybuffer' })
  const data = Buffer.from(res.data)
  await mongo.thumbnails.deleteMany({ artefactId })
  await mongo.thumbnails.insertOne({
    _id: remoteThumbnail.id,
    artefactId,
    data: new Binary(data),
    mimeType: res.headers['content-type'] === 'image/svg+xml' ? 'image/svg+xml' : 'image/webp',
    width: remoteThumbnail.width,
    height: remoteThumbnail.height,
    byteSize: data.byteLength,
    createdAt: new Date().toISOString()
  })
  await mongo.artefacts.updateOne({ _id: artefactId }, { $set: { thumbnail: remoteThumbnail } })
}

const syncNpmArtefact = async (ax: AxiosInstance, remoteUrl: string, artefactId: string) => {
  const encodedId = encodeURIComponent(artefactId)
  const remoteRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const remoteArtefact = remoteRes.data

  const local = await mongo.artefacts.findOne({ _id: artefactId })

  // Fast path: same upstream dataUpdatedAt means no new upload to mirror.
  if (local?.path && local.dataUpdatedAt === remoteArtefact.dataUpdatedAt) {
    await syncThumbnail(ax, artefactId, remoteArtefact.thumbnail, local.thumbnail)
    return
  }

  // Download fresh tarball into local files-storage.
  const localPath = `npm/${artefactId}/${randomUUID()}.tgz`
  const dlRes = await ax.get(
    `/api/v1/artefacts/${encodedId}/download`,
    { responseType: 'stream' }
  )
  await filesStorage.writeStream(dlRes.data, localPath)

  const now = new Date().toISOString()
  const oldPath = local?.path
  await mongo.artefacts.updateOne(
    { _id: artefactId },
    {
      $set: {
        packageName: remoteArtefact.packageName,
        version: remoteArtefact.version,
        licence: remoteArtefact.licence,
        ...(remoteArtefact.packageDescription ? { packageDescription: remoteArtefact.packageDescription } : {}),
        category: remoteArtefact.category,
        deprecated: !!remoteArtefact.deprecated,
        hasNativeModules: !!remoteArtefact.hasNativeModules,
        ...(remoteArtefact.title ? { title: remoteArtefact.title } : {}),
        ...(remoteArtefact.description ? { description: remoteArtefact.description } : {}),
        ...(remoteArtefact.group ? { group: remoteArtefact.group } : {}),
        ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
        path: localPath,
        origin: remoteUrl,
        updatedAt: now,
        dataUpdatedAt: remoteArtefact.dataUpdatedAt || remoteArtefact.updatedAt
      },
      $setOnInsert: {
        _id: artefactId,
        name: remoteArtefact.name,
        format: 'npm' as const,
        public: false,
        privateAccess: [],
        createdAt: now
      }
    },
    { upsert: true }
  )

  if (oldPath && oldPath !== localPath) {
    await filesStorage.delete(oldPath).catch(() => {})
  }
  await syncThumbnail(ax, artefactId, remoteArtefact.thumbnail, local?.thumbnail)
}

const syncFileArtefact = async (ax: AxiosInstance, remoteUrl: string, artefactId: string) => {
  const encodedId = encodeURIComponent(artefactId)
  const remoteRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const remoteArtefact = remoteRes.data

  const local = await mongo.artefacts.findOne({ _id: artefactId })

  // Download if remote is newer or doesn't exist locally
  if (!local || local.updatedAt < remoteArtefact.updatedAt) {
    const dlRes = await ax.get(`/api/v1/artefacts/${encodedId}/download`, {
      responseType: 'stream'
    })

    const fileName = remoteArtefact.fileName || remoteArtefact.name
    const localPath = `files/${remoteArtefact.name}/${randomUUID()}-${fileName}`
    await filesStorage.writeStream(dlRes.data, localPath)

    const oldPath = local?.path
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          path: localPath,
          fileName,
          ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
          category: remoteArtefact.category,
          deprecated: !!remoteArtefact.deprecated,
          ...(remoteArtefact.title ? { title: remoteArtefact.title } : {}),
          ...(remoteArtefact.description ? { description: remoteArtefact.description } : {}),
          origin: remoteUrl,
          updatedAt: now,
          dataUpdatedAt: remoteArtefact.dataUpdatedAt || remoteArtefact.updatedAt
        },
        $setOnInsert: {
          _id: artefactId,
          name: remoteArtefact.name,
          format: 'file' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )

    if (oldPath && oldPath !== localPath) {
      await filesStorage.delete(oldPath).catch(() => {})
    }
  } else {
    // Still ensure origin is set even if file unchanged
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      { $set: { origin: remoteUrl } }
    )
  }
  await syncThumbnail(ax, artefactId, remoteArtefact.thumbnail, local?.thumbnail)
}

// Atomically take the queued selections, so two drains can't sync the same id twice.
const drainPendingSync = async (remoteRegistryId: string): Promise<string[]> => {
  const doc = await mongo.remoteRegistries.findOneAndUpdate(
    { _id: remoteRegistryId },
    { $unset: { pendingSync: '' } },
    { returnDocument: 'before', projection: { pendingSync: 1 } }
  )
  return doc?.pendingSync ?? []
}

export type SyncScope = 'all' | 'pending'

// The actual work. Callers own the lock. `pending` syncs only the artefacts
// queued by selections (see pendingSync); `all` walks every selected artefact.
// Either way, selections queued while this run was in flight are drained before
// returning, so the lock is only released once nothing is left to sync.
const runSync = async (remoteRegistryId: string, scope: SyncScope = 'all') => {
  const remote = await mongo.remoteRegistries.findOne({ _id: remoteRegistryId })
  if (!remote) return

  const artefactIds = scope === 'pending' ? await drainPendingSync(remoteRegistryId) : remote.selectedArtefacts
  const startedAt = new Date().toISOString()
  const total = artefactIds.length
  let done = 0

  await mongo.remoteRegistries.updateOne(
    { _id: remoteRegistryId },
    { $set: { syncProgress: { startedAt, done, total } } }
  )
  await emitSync(remoteRegistryId, { running: true, startedAt, done, total })

  const apiKey = decipher(remote.apiKey)
  const ax = axiosBuilder({
    baseURL: remote._id,
    headers: { 'x-api-key': apiKey }
  })

  let hasErrors = false
  let lastError = ''

  for (const artefactId of artefactIds) {
    await mongo.remoteRegistries.updateOne(
      { _id: remoteRegistryId },
      { $set: { 'syncProgress.currentArtefact': artefactId } }
    )
    await emitSync(remoteRegistryId, { running: true, startedAt, done, total, currentArtefact: artefactId })

    try {
      const encodedId = encodeURIComponent(artefactId)
      const detailRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
      const format: Artefact['format'] = detailRes.data.format

      if (format === 'npm') {
        await syncNpmArtefact(ax, remote._id, artefactId)
      } else {
        await syncFileArtefact(ax, remote._id, artefactId)
      }
    } catch (err: any) {
      hasErrors = true
      lastError = `${artefactId}: ${err.message || err}`
      console.error(`[sync] Error syncing ${artefactId} from ${remote._id}:`, err.message || err)
    }

    done++
    await mongo.remoteRegistries.updateOne(
      { _id: remoteRegistryId },
      { $set: { 'syncProgress.done': done } }
    )
    await emitSync(remoteRegistryId, { running: true, startedAt, done, total, currentArtefact: artefactId })
  }

  const lastSyncAt = new Date().toISOString()
  const lastSyncStatus = hasErrors ? 'error' as const : 'success' as const

  await mongo.remoteRegistries.updateOne(
    { _id: remoteRegistryId },
    {
      $set: {
        lastSyncAt,
        lastSyncStatus,
        ...(hasErrors ? { lastSyncError: lastError } : {})
      },
      $unset: {
        'syncProgress.currentArtefact': '',
        ...(hasErrors ? {} : { lastSyncError: '' })
      }
    }
  )

  // The end event carries the terminal state, so the UI never refetches to learn the outcome.
  await emitSync(remoteRegistryId, {
    running: false,
    startedAt,
    done,
    total,
    lastSyncAt,
    lastSyncStatus,
    ...(hasErrors ? { lastSyncError: lastError } : {})
  })

  // A full run already covered anything queued meanwhile only if it was
  // selected before the run read selectedArtefacts; draining is cheap (the
  // dataUpdatedAt fast path) and keeps the queue semantics simple.
  const pending = await mongo.remoteRegistries.findOne({ _id: remoteRegistryId }, { projection: { pendingSync: 1 } })
  if (pending?.pendingSync?.length) await runSync(remoteRegistryId, 'pending')
}

// Returns as soon as the lock is taken; the work continues in the background.
// A held lock is a conflict the caller (a human clicking a button) should see.
export const startSync = async (remoteRegistryId: string, scope: SyncScope = 'all'): Promise<boolean> => {
  const lockId = syncLockId(remoteRegistryId)
  if (!await locks.acquire(lockId)) return false
  runSync(remoteRegistryId, scope)
    .catch(err => internalError('sync-remote-registry', err))
    .finally(async () => {
      await locks.release(lockId).catch(err => internalError('sync-remote-registry-release', err))
      // A selection can land between the final drain and the release above;
      // its own startSync lost the lock race, so pick it up here.
      const doc = await mongo.remoteRegistries.findOne({ _id: remoteRegistryId }, { projection: { pendingSync: 1 } })
      if (doc?.pendingSync?.length) await startSync(remoteRegistryId, 'pending')
    })
  return true
}

// Queue one freshly selected artefact and sync it in the background. If a sync
// already holds the lock, that run drains the queue before releasing it.
export const enqueueArtefactSync = async (remoteRegistryId: string, artefactId: string) => {
  await mongo.remoteRegistries.updateOne(
    { _id: remoteRegistryId },
    { $addToSet: { pendingSync: artefactId } }
  )
  await startSync(remoteRegistryId, 'pending')
}

// Awaits completion. Used by the daily job, which syncs registries one at a time.
export const syncRemoteRegistry = async (remoteRegistryId: string): Promise<boolean> => {
  const lockId = syncLockId(remoteRegistryId)
  if (!await locks.acquire(lockId)) return false
  try {
    await runSync(remoteRegistryId)
  } finally {
    await locks.release(lockId)
  }
  return true
}

export const syncAllRemoteRegistries = async () => {
  const remotes = await mongo.remoteRegistries.find({}).toArray()
  for (const remote of remotes) {
    // A held lock means a peer replica is already syncing this registry. That is the
    // normal outcome of N replicas firing the same daily timer — not an error.
    await syncRemoteRegistry(remote._id).catch(err => {
      console.error(`[sync] Failed to sync ${remote._id}:`, err.message || err)
    })
  }
}
