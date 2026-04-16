import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import locks from '@data-fair/lib-node/locks.js'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import type { AxiosInstance } from 'axios'
import mongo from '#mongo'
import config from '#config'
import { decipher } from '../cipher.ts'
import { writeFile, deleteFile } from '../files-storage/index.ts'
import type { Artefact } from '#types/artefact/index.ts'

const createSyncTmpDir = async () => {
  const base = config.tmpDir || tmpdir()
  await mkdir(base, { recursive: true })
  return mkdtemp(join(base, 'registry-sync-'))
}

const syncNpmArtefact = async (ax: AxiosInstance, remoteUrl: string, artefactId: string) => {
  const encodedId = encodeURIComponent(artefactId)
  const remoteRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
  const remoteArtefact = remoteRes.data
  const remoteVersions: any[] = remoteArtefact.versions || []

  const localVersions = await mongo.versions.find({ artefactId }).toArray()
  const localVersionKeys = new Set(localVersions.map(v => `${v.version}:${v.architecture || ''}`))
  const remoteVersionKeys = new Set(remoteVersions.map((v: any) => `${v.version}:${v.architecture || ''}`))

  // Download missing versions
  for (const rv of remoteVersions) {
    const key = `${rv.version}:${rv.architecture || ''}`
    if (localVersionKeys.has(key)) continue

    let tmpDir: string | undefined
    try {
      tmpDir = await createSyncTmpDir()
      const tmpFile = join(tmpDir, 'download.tgz')

      const dlRes = await ax.get(`/api/v1/artefacts/${encodedId}/versions/${rv.version}/tarball`, {
        responseType: 'stream'
      })
      await pipeline(dlRes.data, createWriteStream(tmpFile))

      await writeFile(createReadStream(tmpFile), rv.tarballPath)

      await mongo.versions.insertOne({
        _id: new ObjectId().toString(),
        artefactId,
        version: rv.version,
        ...(rv.architecture ? { architecture: rv.architecture } : {}),
        semverMajor: rv.semverMajor,
        semverMinor: rv.semverMinor,
        semverPatch: rv.semverPatch,
        ...(rv.semverPrerelease ? { semverPrerelease: rv.semverPrerelease } : {}),
        tarballPath: rv.tarballPath,
        uploadedAt: rv.uploadedAt,
        ...(rv.uploadedBy ? { uploadedBy: rv.uploadedBy } : {})
      })
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  // Delete local versions pruned upstream
  for (const lv of localVersions) {
    const key = `${lv.version}:${lv.architecture || ''}`
    if (!remoteVersionKeys.has(key)) {
      await deleteFile(lv.tarballPath).catch(() => {})
      await mongo.versions.deleteOne({ _id: lv._id })
    }
  }

  // Upsert artefact metadata
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
        ...(remoteArtefact.processingConfigSchema ? { processingConfigSchema: remoteArtefact.processingConfigSchema } : {}),
        ...(remoteArtefact.applicationConfigSchema ? { applicationConfigSchema: remoteArtefact.applicationConfigSchema } : {}),
        origin: remoteUrl,
        updatedAt: now
      },
      $setOnInsert: {
        _id: artefactId,
        name: remoteArtefact.name,
        format: 'npm' as const,
        majorVersion: remoteArtefact.majorVersion,
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
    let tmpDir: string | undefined
    try {
      tmpDir = await createSyncTmpDir()
      const tmpFile = join(tmpDir, 'download.bin')

      const dlRes = await ax.get(`/api/v1/artefacts/${encodedId}/download`, {
        responseType: 'stream'
      })
      await pipeline(dlRes.data, createWriteStream(tmpFile))

      const fileName = remoteArtefact.fileName || remoteArtefact.name
      const filePath = `files/${remoteArtefact.name}/${randomUUID()}-${fileName}`
      await writeFile(createReadStream(tmpFile), filePath)

      const oldFilePath = local?.filePath
      const now = new Date().toISOString()
      await mongo.artefacts.updateOne(
        { _id: artefactId },
        {
          $set: {
            filePath,
            fileName,
            category: remoteArtefact.category,
            ...(remoteArtefact.title ? { title: remoteArtefact.title } : {}),
            ...(remoteArtefact.description ? { description: remoteArtefact.description } : {}),
            origin: remoteUrl,
            updatedAt: now
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
    } finally {
      if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
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
