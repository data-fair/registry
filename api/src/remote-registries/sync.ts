import { randomUUID } from 'node:crypto'
import locks from '@data-fair/lib-node/locks.js'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import type { AxiosInstance } from 'axios'
import mongo from '#mongo'
import { decipher } from '../cipher.ts'
import { writeFile, deleteFile } from '../files-storage/index.ts'
import type { Artefact } from '#types/artefact/index.ts'

const syncNpmArtefact = async (ax: AxiosInstance, remoteUrl: string, artefactId: string) => {
  const encodedId = encodeURIComponent(artefactId)
  const remoteRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const remoteArtefact = remoteRes.data
  type TarballSlot = NonNullable<Artefact['tarballs']>[string]
  const remoteTarballs: Record<string, TarballSlot & { uploadedAt: string }> =
    remoteArtefact.tarballs || {}

  const local = await mongo.artefacts.findOne({ _id: artefactId })
  const localTarballs: Record<string, TarballSlot & { uploadedAt: string }> = local?.tarballs || {}

  const newTarballs: typeof localTarballs = {}
  for (const [arch, remoteSlot] of Object.entries(remoteTarballs)) {
    const localSlot = localTarballs[arch]
    if (localSlot && localSlot.uploadedAt === remoteSlot.uploadedAt) {
      newTarballs[arch] = localSlot
      continue
    }
    // Download the tarball for this arch slot — stream straight into storage.
    const dlRes = await ax.get(
      `/api/v1/artefacts/${encodedId}/tarball?architecture=${encodeURIComponent(arch)}`,
      { responseType: 'stream' }
    )
    await writeFile(dlRes.data, remoteSlot.path)
    newTarballs[arch] = {
      path: remoteSlot.path,
      size: remoteSlot.size ?? 0,
      uploadedAt: remoteSlot.uploadedAt,
      ...(remoteSlot.uploadedBy ? { uploadedBy: remoteSlot.uploadedBy } : {})
    }
  }

  // Delete local arch slots pruned upstream.
  for (const [arch, localSlot] of Object.entries(localTarballs)) {
    if (!(arch in remoteTarballs)) {
      await deleteFile(localSlot.path).catch(() => {})
    }
  }

  const now = new Date().toISOString()
  await mongo.artefacts.updateOne(
    { _id: artefactId },
    {
      $set: {
        packageName: remoteArtefact.packageName,
        version: remoteArtefact.version,
        licence: remoteArtefact.licence,
        category: remoteArtefact.category,
        ...(remoteArtefact.title ? { title: remoteArtefact.title } : {}),
        ...(remoteArtefact.description ? { description: remoteArtefact.description } : {}),
        ...(remoteArtefact.group ? { group: remoteArtefact.group } : {}),
        ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
        tarballs: newTarballs,
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
    const filePath = `files/${remoteArtefact.name}/${randomUUID()}-${fileName}`
    await writeFile(dlRes.data, filePath)

    const oldFilePath = local?.filePath
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          filePath,
          fileName,
          ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
          category: remoteArtefact.category,
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

    if (oldFilePath && oldFilePath !== filePath) {
      await deleteFile(oldFilePath).catch(() => {})
    }
  } else {
    // Still ensure origin is set even if file unchanged
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      { $set: { origin: remoteUrl } }
    )
  }
}

export const syncRemoteRegistry = async (remoteRegistryId: string) => {
  const lockId = `sync-remote-${remoteRegistryId}`
  const acquired = await locks.acquire(lockId)
  if (!acquired) {
    console.log(`[sync] Lock already held for ${remoteRegistryId}, skipping`)
    return
  }

  try {
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
        // Fetch remote artefact to determine format
        const encodedId = encodeURIComponent(artefactId)
        const detailRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
        const format: Artefact['format'] = detailRes.data.format

        if (format === 'npm') {
          // We already fetched detail, but syncNpmArtefact re-fetches for simplicity
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
          ...(hasErrors ? { lastSyncError: lastError } : {}),
          ...(!hasErrors ? {} : {})
        },
        ...(!hasErrors ? { $unset: { lastSyncError: '' } } : {})
      }
    )
  } finally {
    await locks.release(lockId)
  }
}

export const syncAllRemoteRegistries = async () => {
  const remotes = await mongo.remoteRegistries.find({}).toArray()
  for (const remote of remotes) {
    await syncRemoteRegistry(remote._id).catch(err => {
      console.error(`[sync] Failed to sync ${remote._id}:`, err.message || err)
    })
  }
}
