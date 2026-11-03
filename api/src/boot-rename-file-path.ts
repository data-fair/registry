import type { Db } from 'mongodb'
import log from '@data-fair/lib-node/log.js'

// One-time idempotent migration: file-format artefacts used to carry
// `filePath`; the new schema uses `path` everywhere. We $rename, so on
// re-runs the matcher returns zero docs and the call is a no-op.
//
// TODO(0.5.0): remove this once all environments are past 0.4.0.
export const renameFilePathToPath = async (db: Db): Promise<void> => {
  const res = await db.collection('artefacts').updateMany(
    { filePath: { $exists: true } },
    { $rename: { filePath: 'path' } }
  )
  if (res.modifiedCount > 0) {
    log.info(`migrated ${res.modifiedCount} artefact(s): filePath -> path`, { code: 'boot-rename-file-path' })
  }
}
