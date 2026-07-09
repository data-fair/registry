import { randomUUID } from 'node:crypto'
import locks from '@data-fair/lib-node/locks.js'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { AxiosInstance } from 'axios'
import mongo from '#mongo'
import { decipher } from '../cipher.ts'
import { filesStorage } from '../files-storage/index.ts'
import type { Artefact } from '#types/artefact/index.ts'
import { syncLockId } from './operations.ts'

const syncNpmArtefact = async (ax: AxiosInstance, remoteUrl: string, artefactId: string) => {
  const encodedId = encodeURIComponent(artefactId)
  const remoteRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const remoteArtefact = remoteRes.data

  const local = await mongo.artefacts.findOne({ _id: artefactId })

  // Fast path: same upstream dataUpdatedAt means no new upload to mirror.
  if (local?.path && local.dataUpdatedAt === remoteArtefact.dataUpdatedAt) {
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
}

// The actual work. Callers own the lock.
const runSync = async (remoteRegistryId: string) => {
  const remote = await mongo.remoteRegistries.findOne({ _id: remoteRegistryId })
  if (!remote) return

  const apiKey = decipher(remote.apiKey)
  const ax = axiosBuilder({
    baseURL: remote._id,
    headers: { 'x-api-key': apiKey }
  })

  let hasErrors = false
  let lastError = ''

  for (const artefactId of remote.selectedArtefacts) {
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
  }

  await mongo.remoteRegistries.updateOne(
    { _id: remoteRegistryId },
    {
      $set: {
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: hasErrors ? 'error' : 'success',
        ...(hasErrors ? { lastSyncError: lastError } : {})
      },
      ...(!hasErrors ? { $unset: { lastSyncError: '' } } : {})
    }
  )
}

// Returns as soon as the lock is taken; the work continues in the background.
// A held lock is a conflict the caller (a human clicking a button) should see.
export const startSync = async (remoteRegistryId: string): Promise<boolean> => {
  const lockId = syncLockId(remoteRegistryId)
  if (!await locks.acquire(lockId)) return false
  runSync(remoteRegistryId)
    .catch(err => internalError('sync-remote-registry', err))
    .finally(() => locks.release(lockId))
  return true
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
