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
 * 2-deep retention: keep only the 2 most recent distinct patch values
 * (ignoring prereleases) per minor branch. All architecture variants for a
 * kept patch are retained; variants for pruned patches are fully deleted.
 */
export const pruneOldVersions = async (artefactId: string, semverMajor: number, semverMinor: number) => {
  const versions = await mongo.versions.find({
    artefactId,
    semverMajor,
    semverMinor,
    semverPrerelease: { $exists: false }
  }).sort({ semverPatch: -1, architecture: 1 }).toArray()

  const toDelete = computePruneSet(versions)
  for (const version of toDelete) {
    await deleteFile(version.tarballPath)
    await mongo.versions.deleteOne({ _id: version._id })
  }
}
