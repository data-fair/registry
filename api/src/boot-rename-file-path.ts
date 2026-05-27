import type { Db } from 'mongodb'

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
    console.log(`[boot-rename] migrated ${res.modifiedCount} artefact(s): filePath -> path`)
  }
}
