import mongo from '#mongo'
import { deleteFile } from '../files-storage/index.ts'
import { computePruneSet } from './service-pure.ts'

export type { Manifest } from './service-pure.ts'
export {
  extractManifest,
  parseSemver,
  resolveVersionQuery,
  computePruneSet,
  MAX_DECOMPRESSED_BYTES,
  MAX_MANIFEST_BYTES,
  MAX_TAR_ENTRIES
} from './service-pure.ts'

/**
 * Cross-major retention (prereleases excluded). For older majors keeps the
 * latest version only; for the latest major keeps the 2 most recent. See
 * computePruneSet for the full rule set. Every architecture variant of a
 * pruned (major, minor, patch) tuple is deleted; every variant of a kept
 * tuple stays.
 */
export const pruneOldVersions = async (artefactId: string) => {
  const versions = await mongo.versions.find({
    artefactId,
    semverPrerelease: { $exists: false }
  }).sort({ semverMajor: -1, semverMinor: -1, semverPatch: -1, architecture: 1 }).toArray()

  const toDelete = computePruneSet(versions)
  for (const version of toDelete) {
    await deleteFile(version.tarballPath)
    await mongo.versions.deleteOne({ _id: version._id })
  }
}
