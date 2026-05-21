// Stateful artefact operations: MongoDB access and files-storage orchestration.
// HTTP concerns (auth, request parsing, validation, responses) live in router.ts.
// Pure, unit-testable helpers live in operations.ts.

import { randomUUID } from 'node:crypto'
import { PassThrough, type Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import * as tar from 'tar-stream'
import type { Filter } from 'mongodb'
import type { Artefact } from '#types/artefact/index.ts'
import mongo from '#mongo'
import config from '#config'
import { filesStorage } from '../files-storage/index.ts'
import { extractManifest, sanitizeSpaEntryPath, type Manifest } from './operations.ts'
import { httpError } from '@data-fair/lib-utils/http-errors.js'

export type { Manifest } from './operations.ts'

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
  if (artefact.format === 'file') {
    if (artefact.filePath) await filesStorage.delete(artefact.filePath)
  } else if (artefact.format === 'spa') {
    if (artefact.tarballPath) await filesStorage.delete(artefact.tarballPath).catch(() => {})
    if (artefact.extractedPath) await filesStorage.deleteDir(artefact.extractedPath).catch(() => {})
  } else {
    // npm artefacts store tarballs inline in the `tarballs` map
    for (const slot of Object.values(artefact.tarballs ?? {})) {
      await filesStorage.delete(slot.path).catch(() => {})
    }
  }
  await mongo.thumbnails.deleteMany({ artefactId: artefact._id })
}

// --- npm upload -----------------------------------------------------------

// Reads a staged tarball and extracts its npm manifest. Caps come from config.
export const extractStagedManifest = async (stagingPath: string): Promise<Manifest> => {
  const { body } = await filesStorage.readStream(stagingPath)
  return extractManifest(body, {
    maxDecompressedBytes: config.maxDecompressedBytes,
    maxTarEntries: config.maxTarEntries
  })
}

// Finalize a staged npm tarball into its per-arch slot: move the file into
// place, upsert the artefact doc, then prune the previous occupant of the
// slot. On a DB failure the freshly-moved tarball is removed before
// rethrowing, so the artefact row never points at a missing file.
export const commitNpmUpload = async (params: {
  id: string
  arch: string
  stagingPath: string
  manifest: Manifest
  category: Artefact['category']
  uploadedBy: UploadedBy
  existing: Artefact | null
}): Promise<Artefact> => {
  const { id, arch, stagingPath, manifest, category, uploadedBy, existing } = params
  const tarballPath = `npm/${id}/${arch}-${randomUUID()}.tgz`
  await filesStorage.move(stagingPath, tarballPath)
  try {
    const { size } = await filesStorage.stats(tarballPath)
    const now = new Date().toISOString()
    const tarballEntry = { path: tarballPath, size, uploadedAt: now, uploadedBy }
    await mongo.artefacts.updateOne(
      { _id: id },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          ...(manifest.licence ? { licence: manifest.licence } : {}),
          category,
          [`tarballs.${arch}`]: tarballEntry,
          size,
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
    await filesStorage.delete(tarballPath).catch(() => {})
    throw err
  }

  // Best-effort delete of the previous occupant of this arch slot.
  const previousPath = existing?.tarballs?.[arch]?.path
  if (previousPath && previousPath !== tarballPath) {
    await filesStorage.delete(previousPath).catch(() => {})
  }

  return (await mongo.artefacts.findOne({ _id: id }))!
}

// --- file upload ----------------------------------------------------------

// Finalize a staged raw file. Stores the NEW file first, then commits the DB
// row, then deletes the OLD file — avoiding a window where the artefact row
// points at a missing file. A failed DB write removes the new file.
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
  const filePath = `files/${name}/${randomUUID()}-${fileName}`
  await filesStorage.move(stagingPath, filePath)
  try {
    const { size } = await filesStorage.stats(filePath)
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: artefactId },
      {
        $set: {
          filePath,
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
    await filesStorage.delete(filePath).catch(() => {})
    throw err
  }

  if (existing?.filePath && existing.filePath !== filePath) {
    await filesStorage.delete(existing.filePath).catch(() => {})
  }

  return (await mongo.artefacts.findOne({ _id: artefactId }))!
}

// --- spa upload -----------------------------------------------------------

// Extract a stored npm-packed SPA tarball into files-storage under `destPrefix`.
// Each retained entry is written at `${destPrefix}/${relativePath}`. Returns
// whether an index.html was present. Enforces decompressed-size and entry-count
// caps so a malicious archive cannot exhaust storage.
export const extractSpaTarball = async (
  tarballStoragePath: string,
  destPrefix: string
): Promise<{ indexHtmlFound: boolean }> => {
  const maxDecompressedBytes = config.maxDecompressedBytes ?? 1024 * 1024 * 1024
  const maxTarEntries = config.maxTarEntries ?? 100_000
  const { body } = await filesStorage.readStream(tarballStoragePath)

  // Bound the decompressed byte count regardless of compressed input size.
  let decompressedBytes = 0
  const counter = new PassThrough()
  counter.on('data', (chunk: Buffer) => {
    decompressedBytes += chunk.length
    if (decompressedBytes > maxDecompressedBytes) {
      counter.destroy(httpError(413, `decompressed SPA exceeds ${maxDecompressedBytes} bytes`))
    }
  })

  const extract = tar.extract()
  let indexHtmlFound = false
  let entryCount = 0

  extract.on('entry', (header, entryStream, next) => {
    entryCount++
    if (entryCount > maxTarEntries) {
      entryStream.on('end', () => next(httpError(413, `tarball exceeds ${maxTarEntries} entries`)))
      entryStream.resume()
      return
    }
    const rel = sanitizeSpaEntryPath(header.name)
    if (!rel) {
      entryStream.on('end', next)
      entryStream.resume()
      return
    }
    if (rel === 'index.html') indexHtmlFound = true
    filesStorage.writeStream(entryStream, `${destPrefix}/${rel}`)
      .then(() => next())
      .catch(next)
  })

  await pipeline(body, createGunzip(), counter, extract)
  return { indexHtmlFound }
}

// Finalize a staged SPA tarball: extract it into a fresh directory, move the
// tarball into place, upsert the artefact doc, then prune the previous
// tarball and extracted tree. On a failure after extraction the partial
// outputs are removed so no orphaned state survives.
export const commitSpaUpload = async (params: {
  id: string
  stagingPath: string
  manifest: Manifest
  category: Artefact['category']
  uploadedBy: UploadedBy
  existing: Artefact | null
}): Promise<Artefact> => {
  const { id, stagingPath, manifest, category, uploadedBy, existing } = params
  const extractedPath = `spa/${id}/files-${randomUUID()}`
  const tarballPath = `spa/${id}/tarball-${randomUUID()}.tgz`

  let indexHtmlFound: boolean
  try {
    ({ indexHtmlFound } = await extractSpaTarball(stagingPath, extractedPath))
  } catch (err) {
    await filesStorage.deleteDir(extractedPath).catch(() => {})
    throw err
  }
  if (!indexHtmlFound) {
    await filesStorage.deleteDir(extractedPath).catch(() => {})
    throw httpError(400, 'SPA tarball does not contain an index.html')
  }

  await filesStorage.move(stagingPath, tarballPath)
  try {
    const { size } = await filesStorage.stats(tarballPath)
    const now = new Date().toISOString()
    await mongo.artefacts.updateOne(
      { _id: id },
      {
        $set: {
          packageName: manifest.name,
          version: manifest.version,
          ...(manifest.licence ? { licence: manifest.licence } : {}),
          category,
          tarballPath,
          extractedPath,
          size,
          uploadedBy,
          updatedAt: now,
          dataUpdatedAt: now
        },
        $setOnInsert: {
          _id: id,
          name: id,
          format: 'spa' as const,
          public: false,
          privateAccess: [],
          createdAt: now
        }
      },
      { upsert: true }
    )
  } catch (err) {
    await filesStorage.delete(tarballPath).catch(() => {})
    await filesStorage.deleteDir(extractedPath).catch(() => {})
    throw err
  }

  // Best-effort prune of the previous tarball and extracted tree.
  if (existing?.tarballPath && existing.tarballPath !== tarballPath) {
    await filesStorage.delete(existing.tarballPath).catch(() => {})
  }
  if (existing?.extractedPath && existing.extractedPath !== extractedPath) {
    await filesStorage.deleteDir(existing.extractedPath).catch(() => {})
  }

  return (await mongo.artefacts.findOne({ _id: id }))!
}

// --- download -------------------------------------------------------------

export type DownloadSource =
  | { redirectUrl: string }
  | { body: Readable, size: number, lastModified: Date }

// Resolve a stored file into something the router can hand to the client:
// a signed redirect URL when the backend offers one, otherwise a stream.
export const resolveDownload = async (
  path: string,
  filename: string,
  ifModifiedSince?: string
): Promise<DownloadSource> => {
  const signedUrl = await filesStorage.getDownloadUrl(path, { filename })
  if (signedUrl) return { redirectUrl: signedUrl }
  const { body, size, lastModified } = await filesStorage.readStream(path, ifModifiedSince)
  return { body, size, lastModified }
}
