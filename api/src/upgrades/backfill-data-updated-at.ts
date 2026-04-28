// TODO: remove this backfill (and its callers / test-env endpoints / test) once
// all instances have been upgraded past the introduction of artefact.dataUpdatedAt.
// One-shot backfill: for npm artefacts we use the most recent version.uploadedAt;
// for file artefacts we read the underlying object's last-modified time from
// storage. updatedAt is only used as a last-resort fallback.

import { internalError } from '@data-fair/lib-node/observer.js'
import locks from '@data-fair/lib-node/locks.js'
import mongo from '#mongo'
import { fileStats } from '../files-storage/index.ts'

export const backfillDataUpdatedAt = async () => {
  const acquired = await locks.acquire('backfill-data-updated-at')
  if (!acquired) return

  try {
    const artefacts = mongo.artefacts.find({ dataUpdatedAt: { $exists: false } })
    for await (const artefact of artefacts) {
      try {
        let dataUpdatedAt: string | undefined
        if (artefact.format === 'npm') {
          const latest = await mongo.versions.find({ artefactId: artefact._id })
            .sort({ uploadedAt: -1 })
            .limit(1)
            .next()
          if (latest?.uploadedAt) dataUpdatedAt = latest.uploadedAt
        } else if (artefact.filePath) {
          const { lastModified } = await fileStats(artefact.filePath)
          dataUpdatedAt = lastModified.toISOString()
        }
        if (!dataUpdatedAt) dataUpdatedAt = artefact.updatedAt
        await mongo.artefacts.updateOne({ _id: artefact._id }, { $set: { dataUpdatedAt } })
      } catch (err) {
        internalError('backfill-data-updated-at', `artefact ${artefact._id}: ${(err as Error).message || err}`)
      }
    }
  } finally {
    await locks.release('backfill-data-updated-at')
  }
}
