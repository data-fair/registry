# SVG thumbnail passthrough

## Problem

Today every uploaded thumbnail goes through Sharp: rasterized, resized to 400 px wide, re-encoded as WebP. For SVG inputs this throws away the vector representation and produces a blurry raster at one fixed size. Plugin icons are commonly authored as SVG; we want to preserve them.

## Goal

When the uploaded thumbnail is `image/svg+xml`, store the original bytes and serve them as-is with the correct content type. All other formats keep the existing Sharp pipeline.

## Precedent

`data-fair/portals` already does this in `api/src/images/resize-image.ts:12-15`:

```ts
if (input.mimetype === 'image/svg+xml') {
  const data = await fs.readFile(input.filePath)
  return { data, width: 0, height: 0, mimeType: 'image/svg+xml' }
}
```

We mirror that approach: trust the multipart `Content-Type`, skip image processing, report `0×0` dimensions.

## Changes

### `api/src/thumbnails/router.ts`

In the POST handler, after `bufferSingleFileUpload` returns:

- If `mimetype === 'image/svg+xml'`, skip the call to `resizeThumbnail`. Build the `resized`-shaped local with `data` = the uploaded buffer, `width: 0`, `height: 0`, `byteSize: data.byteLength`, and use `'image/svg+xml'` as the stored `mimeType`.
- Otherwise, the existing Sharp path runs unchanged.

The same MongoDB write, artefact patch, and 201 response shape are used for both branches — only the buffer and `mimeType` differ.

### `api/src/mongo.ts`

Widen the `Thumbnail.mimeType` type literal:

```ts
mimeType: 'image/webp' | 'image/svg+xml'
```

No data migration. Existing docs keep `'image/webp'`.

### `publicThumbnailsRouter.get('/:id/data')`

No change. It already sets `Content-Type: thumbnail.mimeType` and `Content-Length: thumbnail.byteSize`, which is correct for both branches.

### Artefact schema

No change. `artefact.thumbnail.width` / `height` remain `integer`; `0` is a valid integer. The schema has no `minimum`.

### UI

One call site binds `:width` and `:height` from the artefact:

- `ui/src/components/artefact-admin.vue:14-17` (admin preview)

Change those bindings so a `0` falls back to `undefined`:

```html
:width="artefact.thumbnail.width || undefined"
:height="artefact.thumbnail.height || undefined"
```

That lets Vuetify use intrinsic sizing (the SVG's own viewBox) instead of collapsing the element to a zero-sized box.

`ui/src/pages/index.vue:107-114` is unaffected — it uses fixed `width="40" height="40"` literals, not dimension bindings.

### Tests

Add one test in `tests/thumbnails.api.spec.ts`:

- Build a small SVG buffer (e.g. `Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')`).
- POST with `contentType: 'image/svg+xml'`.
- Assert `201`, `res.data.thumbnail.width === 0`, `res.data.thumbnail.height === 0`.
- GET `/v1/thumbnails/:id/data` and assert `Content-Type: image/svg+xml`, body byte-identical to the uploaded buffer.

The existing PNG test already covers the WebP branch.

## Non-goals

- **No sanitization.** Uploads are admin / internal-service only. Trust the source.
- **No CSP header** on the public download route.
- **No viewBox parsing.** Width/height stay `0`; the UI uses intrinsic sizing.
- **No content sniffing.** Detection is by multipart `Content-Type` only, same as portals.
