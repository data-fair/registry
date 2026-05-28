// Stateful artefact operations: MongoDB access and files-storage orchestration.
// HTTP concerns (auth, request parsing, validation, responses) live in router.ts.
// Pure, unit-testable helpers live in operations.ts.

import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import type { Filter } from 'mongodb'
import type { Artefact } from '#types/artefact/index.ts'
import mongo from '#mongo'
import config from '#config'
import { filesStorage } from '../files-storage/index.ts'
import { extractManifest, type Manifest } from './operations.ts'

export type { Manifest, ExtractManifestResult } from './operations.ts'

type UploadedBy = NonNullable<Artefact['uploadedBy']>

// --- listing & reads ------------------------------------------------------

export const listArtefacts = async (
  filter: Filter<Artefact>,
  opts: { sort: Record<string, 1 | -1>, skip: number, size: number }
) => {
  const [results, count] = await Promise.all([
    mongo.artefacts.find(filter).sort(opts.sort).skip(opts.skip).limit(opts.size).toArray(),
    mongo.artefacts.countDocuments(filter)
  ])
  return { results, count }
}

// Access-filtered single read, for the public-facing GET endpoints.
export const getArtefact = (id: string, filter: Filter<Artefact>) =>
  mongo.artefacts.findOne({ _id: id, ...filter })

// Unfiltered single read, for the admin/upload paths that need the raw doc.
export const getArtefactById = (id: string) =>
  mongo.artefacts.findOne({ _id: id })

// Distinct, non-empty group values for one category + locale. Seeds the group
// combobox suggestions in the admin form.
export const listGroupValues = async (
  category: Artefact['category'],
  locale: 'en' | 'fr'
): Promise<string[]> => {
  const field = `group.${locale}`
  const values = await mongo.artefacts.distinct(field, { category })
  return (values as unknown[])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .sort((a, b) => a.localeCompare(b))
}

// --- metadata patch -------------------------------------------------------

export const patchArtefact = (id: string, body: Record<string, unknown>) => {
  // Remove null values (PATCH null = unset the field)
  const $set: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  const $unset: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (value === null) $unset[key] = ''
    else $set[key] = value
  }
  const update: Record<string, unknown> = { $set }
  if (Object.keys($unset).length > 0) update.$unset = $unset
  return mongo.artefacts.findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' })
}

// --- delete ---------------------------------------------------------------

export const deleteArtefact = async (artefact: Artefact) => {
  // Delete DB state first so concurrent GETs fail cleanly with 404,
  // then best-effort remove files.
  await mongo.artefacts.deleteOne({ _id: artefact._id })
  if (artefact.path) await filesStorage.delete(artefact.path).catch(() => {})
  await mongo.thumbnails.deleteMany({ artefactId: artefact._id })
}

// --- npm upload -----------------------------------------------------------

// Reads a staged tarball and extracts its npm manifest. Caps come from config.
export const extractStagedManifest = async (
  stagingPath: string
): Promise<{ manifest: Manifest, hasNativeModules: boolean }> => {
  const { body } = await filesStorage.readStream(stagingPath)
  return extractManifest(body, {
    maxDecompressedBytes: config.maxDecompressedBytes,
    maxTarEntries: config.maxTarEntries
  })
}

// Finalize a staged npm tarball: move the file into place, upsert the artefact
// doc, then prune the previous tarball. On a DB failure the freshly-moved
// tarball is removed before rethrowing, so the artefact row never points at a
// missing file.
export const commitNpmUpload = async (params: {
  id: string
  stagingPath: string
  manifest: Manifest
  hasNativeModules: boolean
  category: Artefact['category']
  uploadedBy: UploadedBy
  existing: Artefact | null
}): Promise<Artefact> => {
  const { id, stagingPath, manifest, hasNativeModules, category, uploadedBy, existing } = params
  // Namespace new writes with a random suffix so a failed delete of the
  // old tarball doesn't clobber the fresh one.
  const path = `npm/${id}/${randomUUID()}.tgz`
  await filesStorage.move(stagingPath, path)
  try {
    const { size } = await filesStorage.stats(path)
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: id },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          ...(manifest.licence ? { licence: manifest.licence } : {}),
          category,
          path,
          size,
          hasNativeModules,
          uploadedBy,
          updatedAt: now,
          dataUpdatedAt: now
        },
        $setOnInsert: {
          _id: id,
          name: id,
          format: 'npm' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )
  } catch (err) {
    await filesStorage.delete(path).catch(() => {})
    throw err
  }

  if (existing?.path && existing.path !== path) {
    await filesStorage.delete(existing.path).catch(() => {})
  }

  return (await mongo.artefacts.findOne({ _id: id }))!
}

// --- file upload ----------------------------------------------------------

// Finalize a staged raw file: move it into its final path, commit the DB row,
// then delete the OLD file — avoiding a window where the artefact row points
// at a missing file. A failed DB write removes the freshly-moved file.
export const commitFileUpload = async (params: {
  artefactId: string
  name: string
  fileName: string
  stagingPath: string
  category: Artefact['category']
  title?: Artefact['title']
  description?: Artefact['description']
  uploadedBy: UploadedBy
}): Promise<Artefact> => {
  const { artefactId, name, fileName, stagingPath, category, title, description, uploadedBy } = params
  const existing = await mongo.artefacts.findOne({ _id: artefactId })
  // Namespace new writes with a random suffix so a failed delete of the
  // old file doesn't clobber the fresh one.
  const path = `files/${name}/${randomUUID()}-${fileName}`
  await filesStorage.move(stagingPath, path)
  try {
    const { size } = await filesStorage.stats(path)
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          path,
          fileName,
          size,
          category,
          ...(title !== undefined ? { title } : {}),
          ...(description !== undefined ? { description } : {}),
          uploadedBy,
          updatedAt: now,
          dataUpdatedAt: now
        },
        $setOnInsert: {
          _id: artefactId,
          name,
          format: 'file' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )
  } catch (err) {
    await filesStorage.delete(path).catch(() => {})
    throw err
  }

  if (existing?.path && existing.path !== path) {
    await filesStorage.delete(existing.path).catch(() => {})
  }

  return (await mongo.artefacts.findOne({ _id: artefactId }))!
}

// --- download -------------------------------------------------------------

export type DownloadSource =
  | { redirectUrl: string }
  | { body: Readable, size: number, lastModified: Date }

// Resolve a stored file into something the router can hand to the client:
// a signed redirect URL when the backend offers one, otherwise a stream.
// Conditional-GET (If-Modified-Since/304) is handled by the route handler
// against the artefact doc, not by the storage backend.
export const resolveDownload = async (
  path: string,
  filename: string
): Promise<DownloadSource> => {
  const signedUrl = await filesStorage.getDownloadUrl(path, { filename })
  if (signedUrl) return { redirectUrl: signedUrl }
  const { body, size, lastModified } = await filesStorage.readStream(path)
  return { body, size, lastModified }
}
