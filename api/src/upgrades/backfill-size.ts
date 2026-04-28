// TODO: remove this backfill (and its callers / test-env endpoints / test) once
// all instances have been upgraded past the introduction of size on artefacts/versions.
// One-shot backfill that reads the underlying file size for documents missing it.

import { internalError } from '@data-fair/lib-node/observer.js'
import locks from '@data-fair/lib-node/locks.js'
import mongo from '#mongo'
import { fileStats } from '../files-storage/index.ts'

export const backfillSize = async () => {
  const acquired = await locks.acquire('backfill-size')
  if (!acquired) return

  try {
    const versions = mongo.versions.find({ size: { $exists: false } })
    for await (const version of versions) {
      try {
        const { size } = await fileStats(version.tarballPath)
        await mongo.versions.updateOne({ _id: version._id }, { $set: { size } })
      } catch (err) {
        internalError('backfill-size', `version ${version._id}: ${(err as Error).message || err}`)
      }
    }

    const artefacts = mongo.artefacts.find({ format: 'file', filePath: { $exists: true }, size: { $exists: false } })
    for await (const artefact of artefacts) {
      try {
        const { size } = await fileStats(artefact.filePath!)
        await mongo.artefacts.updateOne({ _id: artefact._id }, { $set: { size } })
      } catch (err) {
        internalError('backfill-size', `artefact ${artefact._id}: ${(err as Error).message || err}`)
      }
    }

    const npmArtefacts = mongo.artefacts.find({ format: 'npm', size: { $exists: false } })
    for await (const artefact of npmArtefacts) {
      try {
        const latest = await mongo.versions.find({ artefactId: artefact._id })
          .sort({ semverMajor: -1, semverMinor: -1, semverPatch: -1 })
          .limit(1)
          .next()
        if (typeof latest?.size === 'number') {
          await mongo.artefacts.updateOne({ _id: artefact._id }, { $set: { size: latest.size } })
        }
      } catch (err) {
        internalError('backfill-size', `npm artefact ${artefact._id}: ${(err as Error).message || err}`)
      }
    }
  } finally {
    await locks.release('backfill-size')
  }
}
