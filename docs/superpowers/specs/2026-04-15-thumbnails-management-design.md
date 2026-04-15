# Self-contained thumbnails management for artefacts

## Context

Today `artefact.thumbnail` is a plain URL string the superadmin edits through the
vjsf patch form. The registry does not host the image — it just renders whatever
external URL was typed. We want thumbnails to be fully managed by the registry:
uploaded, resized, stored, and served locally. The portals project has a similar
image subsystem we are loosely mirroring.

There is no production data to preserve.

## Goals

- Superadmin uploads an image file for an artefact; registry resizes and stores it.
- Public, cache-friendly URL to fetch the resized image.
- One thumbnail per artefact, deleted when the artefact is deleted.
- No external URLs; the previous `thumbnail` URL field is removed end-to-end.

## Non-goals

- Multiple size variants (desktop/mobile). Single fixed size only.
- Reuse of images across artefacts (each thumbnail belongs to exactly one artefact).
- Generic image subsystem for other future entities. Scope is artefacts only.
- Per-artefact access control on the image endpoint. Thumbnails are public.

## Data model

New Mongo collection `thumbnails`:

```ts
{
  _id: string,            // uuid, stable id used in the public URL
  artefactId: string,     // unique index, 1:1 link
  data: Binary,           // resized webp bytes
  mimeType: 'image/webp',
  width: number,
  height: number,
  byteSize: number,
  createdAt: string
}
```

Indexes: `{ artefactId: 1 }` unique.

Artefact schema change in `api/types/artefact/schema.js`: replace
`thumbnail?: string` with

```ts
thumbnail?: { id: string, width: number, height: number }
```

Enough to render `<img width height src=...>` without a second request and
without layout shift. The `thumbnail` field is removed from
`api/doc/artefacts/patch-req/schema.js` — it is no longer user-editable via the
JSON patch endpoint and is managed only through the dedicated upload endpoint.

On startup, a one-shot cleanup unsets any stale string `thumbnail` fields from
the `artefacts` collection. No importer; no back-compat shim.

## API

All three endpoints live in a new `api/src/thumbnails/router.ts`. The
`POST`/`DELETE` ones are mounted under the artefacts router at
`/:id/thumbnail`; the public GET is mounted at app level.

### POST /api/v1/artefacts/:id/thumbnail

- Auth: `session.reqAdminMode(req)`.
- Body: multipart single file (field name `file`).
- Reuses the existing `createUploadTmpDir` + busboy streaming pattern from
  `api/src/artefacts/router.ts`. If that helper proves awkward to share, it is
  lifted into a small `utils/upload.ts` as part of this work.
- Enforces a max upload of 5 MB at the busboy layer.
- Runs the resize via a Piscina worker. Resize rules:
  - Reject if `metadata.width * metadata.height > MAX_PIXELS` (same limit as
    portals) with `400 image exceeds maximum pixel limit`.
  - `sharp(filePath).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true })`.
- Deletes any existing thumbnail doc for that artefact, then inserts a new one
  with a fresh uuid.
- Updates `artefact.thumbnail = { id, width, height }` and `updatedAt`.
- Returns the updated artefact.
- Cleans up the tmp dir in `finally`.

### DELETE /api/v1/artefacts/:id/thumbnail

- Auth: `session.reqAdminMode(req)`.
- Deletes the `thumbnails` doc for that artefact and `$unset`s
  `artefact.thumbnail`. Returns 204.

### GET /api/v1/thumbnails/:id/data

- No auth. Public.
- Responds with the stored bytes, `Content-Type: image/webp`,
  `Cache-Control: public, max-age=31536000, immutable`,
  `X-Accel-Buffering: yes`.
- Because the `_id` is a fresh uuid per upload, replacing a thumbnail produces
  a new URL and caches are automatically busted. The old id returns 404.

### Artefact deletion

The existing `DELETE /api/v1/artefacts/:id` handler already cleans up tarballs
and files; a line is added to also `deleteMany` from `thumbnails` by
`artefactId`. No orphans possible because of the 1:1 link.

## Resize worker

New files under `api/src/thumbnails/`:

- `resize-thumbnail.ts` — Piscina worker module. Input
  `{ filePath: string, mimetype: string }`, output
  `{ data: Buffer, width: number, height: number, mimeType: 'image/webp', byteSize: number }`.
  Pure function of its input, fully unit-testable with a fixture image.
- `service.ts` — owns a single `Piscina` instance
  (`minThreads: 0`, `maxThreads: 1`, `idleTimeout: 60 * 60 * 1000`), exposes
  `resizeThumbnail(filePath, mimetype)`. Mirrors the pattern in
  `portals/api/src/images/router.ts`.
- `router.ts` — the three endpoints above.

Dependencies added explicitly in `api/package.json`: `sharp` and `piscina`.

## UI

### Admin artefact page — `ui/src/pages/admin/artefacts/[id].vue`

New dedicated "Thumbnail" panel, rendered outside the vjsf patch form:

- If no thumbnail: file picker + "Upload" button.
- If thumbnail exists: preview
  `<img :src="/api/v1/thumbnails/<id>/data" :width :height>`, "Replace"
  button (same picker), "Remove" button.
- All three actions hit the API immediately and refresh the artefact from the
  response. No interaction with the patch form's submit button; no "dirty form"
  state for the file.

The `thumbnail` field is removed from the vjsf patch schema. The
`vjsf-patch-req-*.vue` bundles are regenerated via `npm run build-types`.

### Artefact list / detail pages

`ui/src/pages/artefacts/index.vue` and any other page rendering a thumbnail:
switch from `artefact.thumbnail` (URL string) to

```
artefact.thumbnail
  ? `/api/v1/thumbnails/${artefact.thumbnail.id}/data`
  : null
```

with `width` / `height` attributes on the `<img>` to avoid layout shift.

## Tests

New `tests/thumbnails.api.spec.ts`:

- Upload small PNG as superadmin → 201, artefact has `thumbnail.id`,
  anonymous GET `/thumbnails/<id>/data` returns webp bytes with the expected
  cache headers.
- Replace: second upload yields a new id; the old id returns 404.
- Remove: DELETE clears `artefact.thumbnail` and the thumbnails doc.
- Non-admin upload → 403. Upload to a missing artefact → 404.
- Oversized pixel count → 400.
- Deleting the artefact also removes the linked thumbnail doc (list after
  delete, or direct mongo check).

Pure unit test (`*.unit.spec.ts`) for `resize-thumbnail.ts` using a fixture
image under `tests/fixtures/`: asserts output dimensions, mime type, and that
output bytes parse as webp.

## Migration

A one-shot `mongo.artefacts.updateMany({ thumbnail: { $type: 'string' } }, { $unset: { thumbnail: '' } })`
on startup, added to the existing mongo init hook. Confirmed there is no
production data, so no importer and no back-compat shim.

## Out of scope / future work

- Multiple variants.
- Image reuse across artefacts.
- Generic image subsystem for other entity types.
- Per-artefact access control on the image endpoint.
