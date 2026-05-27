# SVG thumbnail passthrough — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the thumbnail upload is `image/svg+xml`, bypass Sharp and store the original SVG bytes; serve them as-is with `Content-Type: image/svg+xml`.

**Architecture:** Mirror `data-fair/portals` (`api/src/images/resize-image.ts:12-15`). Detect SVG by multipart `Content-Type`; skip resizing; store raw bytes with `width: 0, height: 0, mimeType: 'image/svg+xml'`. The existing public download route already echoes `thumbnail.mimeType`, so it just works. UI stops binding `width="0" height="0"` and lets the browser size SVGs intrinsically.

**Tech Stack:** Node.js (Express, MongoDB, Busboy), TypeScript, Vue 3 / Vuetify, Playwright test runner.

**Spec:** `docs/superpowers/specs/2026-05-27-svg-thumbnail-passthrough-design.md`

---

## File Structure

- Modify: `api/src/mongo.ts` — widen `Thumbnail.mimeType` literal type
- Modify: `api/src/thumbnails/router.ts` — branch on SVG mimetype, skip `resizeThumbnail`
- Modify: `ui/src/components/artefact-admin.vue` — make `:width`/`:height` bindings fall back to `undefined` when `0`
- Modify: `tests/thumbnails.api.spec.ts` — add an SVG round-trip test

No new files. No schema regeneration (JSON schemas are unchanged).

---

## Task 1: Widen the stored thumbnail mimeType

**Files:**
- Modify: `api/src/mongo.ts:9-18`

- [ ] **Step 1: Inspect the current type**

The current `Thumbnail` type:

```ts
export type Thumbnail = {
  _id: string
  artefactId: string
  data: Binary
  mimeType: 'image/webp'
  width: number
  height: number
  byteSize: number
  createdAt: string
}
```

- [ ] **Step 2: Widen the `mimeType` literal**

Replace the `mimeType: 'image/webp'` line with:

```ts
  mimeType: 'image/webp' | 'image/svg+xml'
```

- [ ] **Step 3: Run type checking to confirm nothing else breaks**

```bash
npm run check-types
```

Expected: PASS. The thumbnail router currently writes the literal `'image/webp'`, which still narrows correctly against the union.

- [ ] **Step 4: Commit**

```bash
git add api/src/mongo.ts
git commit -m "refactor(mongo): widen Thumbnail.mimeType to accept svg"
```

---

## Task 2: Failing test for SVG passthrough

**Files:**
- Modify: `tests/thumbnails.api.spec.ts`

- [ ] **Step 1: Add an SVG round-trip test at the end of the `describe('Thumbnails', …)` block (just before its closing `})`)**

Append this test inside `test.describe('Thumbnails', () => { … })`, after the existing `'deleting an artefact removes its thumbnail'` test:

```ts
  test('SVG upload is preserved byte-for-byte and served as image/svg+xml', async () => {
    const artefactId = await createArtefact('@test/svg-pkg')
    const admin = await superAdmin

    const svgSource = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>'
    )
    const form = new FormData()
    form.append('file', svgSource, { filename: 'icon.svg', contentType: 'image/svg+xml' })
    const res = await admin.post(
      `/api/v1/artefacts/${encodeURIComponent(artefactId)}/thumbnail`,
      form,
      { headers: form.getHeaders() }
    )

    expect(res.status).toBe(201)
    expect(res.data.thumbnail).toBeTruthy()
    expect(res.data.thumbnail.width).toBe(0)
    expect(res.data.thumbnail.height).toBe(0)

    const thumbId = res.data.thumbnail.id
    const get = await anonymousAx.get(
      `/api/v1/thumbnails/${thumbId}/data`,
      { responseType: 'arraybuffer' }
    )
    expect(get.status).toBe(200)
    expect(get.headers['content-type']).toBe('image/svg+xml')
    expect(get.headers['cache-control']).toContain('immutable')
    expect(Buffer.from(get.data).equals(svgSource)).toBe(true)
  })
```

- [ ] **Step 2: Run the new test and confirm it fails**

```bash
npm run test tests/thumbnails.api.spec.ts
```

Expected: the new test FAILS. Most likely failure mode is a `400` response from the POST (Sharp's `failOn: 'error'` accepts SVG but returns dimensions different from `0`, so width/height assertions fail; or, depending on Sharp version, "INVALID_IMAGE_DIMENSIONS"). The other tests still pass.

Do not commit yet — Task 3 makes it pass.

---

## Task 3: Bypass Sharp for SVG uploads

**Files:**
- Modify: `api/src/thumbnails/router.ts:62-114`

- [ ] **Step 1: Replace the resize call with a branch**

Find this block (lines roughly 75–84):

```ts
    const { data, mimetype } = await bufferSingleFileUpload(req)

    let resized
    try {
      resized = await resizeThumbnail({ data, mimetype })
    } catch (err: any) {
      if (err?.message === 'IMAGE_EXCEEDS_PIXEL_LIMIT') throw httpError(400, 'image exceeds maximum pixel limit')
      if (err?.message === 'INVALID_IMAGE_DIMENSIONS') throw httpError(400, 'invalid image')
      throw httpError(400, `image processing failed: ${err?.message ?? err}`)
    }
```

Replace with:

```ts
    const { data, mimetype } = await bufferSingleFileUpload(req)

    // SVG passes through unchanged — vector should not be rasterized. We trust
    // the multipart Content-Type (uploads are admin / internal-service only).
    // Mirrors the same branch in data-fair/portals (api/src/images/resize-image.ts).
    let resized: { data: Buffer, width: number, height: number, mimeType: 'image/webp' | 'image/svg+xml', byteSize: number }
    if (mimetype === 'image/svg+xml') {
      resized = { data, width: 0, height: 0, mimeType: 'image/svg+xml', byteSize: data.byteLength }
    } else {
      try {
        resized = await resizeThumbnail({ data, mimetype })
      } catch (err: any) {
        if (err?.message === 'IMAGE_EXCEEDS_PIXEL_LIMIT') throw httpError(400, 'image exceeds maximum pixel limit')
        if (err?.message === 'INVALID_IMAGE_DIMENSIONS') throw httpError(400, 'invalid image')
        throw httpError(400, `image processing failed: ${err?.message ?? err}`)
      }
    }
```

- [ ] **Step 2: Use `resized.mimeType` in the insert instead of the hardcoded `'image/webp'`**

Find this block (lines roughly 91–100):

```ts
    await mongo.thumbnails.insertOne({
      _id: id,
      artefactId,
      data: new Binary(resized.data),
      mimeType: 'image/webp',
      width: resized.width,
      height: resized.height,
      byteSize: resized.byteSize,
      createdAt
    })
```

Replace the `mimeType` line:

```ts
      mimeType: resized.mimeType,
```

So the full insert becomes:

```ts
    await mongo.thumbnails.insertOne({
      _id: id,
      artefactId,
      data: new Binary(resized.data),
      mimeType: resized.mimeType,
      width: resized.width,
      height: resized.height,
      byteSize: resized.byteSize,
      createdAt
    })
```

- [ ] **Step 3: Run the SVG test and confirm it passes**

```bash
npm run test tests/thumbnails.api.spec.ts
```

Expected: all tests PASS, including the new SVG case and the existing PNG / replacement / delete / 404 / auth tests.

- [ ] **Step 4: Run type checking**

```bash
npm run check-types
```

Expected: PASS.

- [ ] **Step 5: Run the linter**

```bash
npm run lint-fix
```

Expected: PASS (no unfixed errors).

- [ ] **Step 6: Commit (server change + test together)**

```bash
git add api/src/thumbnails/router.ts tests/thumbnails.api.spec.ts
git commit -m "feat(thumbnails): pass svg uploads through unchanged"
```

---

## Task 4: UI sizing fix for 0×0 thumbnails

**Files:**
- Modify: `ui/src/components/artefact-admin.vue:14-17`

- [ ] **Step 1: Update the `<img>` size bindings so `0` falls back to `undefined`**

Find:

```html
          <img
            :src="thumbnailUrl!"
            :width="artefact.thumbnail.width"
            :height="artefact.thumbnail.height"
            :style="{ maxWidth: '100%', height: 'auto', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px' }"
            alt=""
          >
```

Replace the two binding lines with:

```html
            :width="artefact.thumbnail.width || undefined"
            :height="artefact.thumbnail.height || undefined"
```

So the full element becomes:

```html
          <img
            :src="thumbnailUrl!"
            :width="artefact.thumbnail.width || undefined"
            :height="artefact.thumbnail.height || undefined"
            :style="{ maxWidth: '100%', height: 'auto', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px' }"
            alt=""
          >
```

- [ ] **Step 2: Run UI lint**

```bash
npm run lint-fix
```

Expected: PASS.

- [ ] **Step 3: Verify visually**

Pre-check (the user manages dev processes — do NOT start/restart anything):

```bash
bash dev/status.sh
```

Expected: dev-api and dev-ui both running. If not, stop and tell the user.

Then in a browser:

1. Sign in as `superadmin` (`superadmin@test.com` / `passwd`).
2. Open any artefact's admin page (`/artefacts/<id>`).
3. Upload a small SVG via the thumbnail file picker. The admin preview should render the SVG at a sensible intrinsic size (not collapsed to 0×0, not stretched).
4. Replace it with a PNG: the preview should keep using the stored `width × height` (e.g. 400 × proportional).

If you cannot complete step 3 (no SVG handy), generate a one-line SVG file:

```bash
printf '%s' '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="orange"/></svg>' > /tmp/test-icon.svg
```

Then upload `/tmp/test-icon.svg`.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/artefact-admin.vue
git commit -m "fix(ui): size svg thumbnails by intrinsic dimensions"
```

---

## Task 5: Full quality run

- [ ] **Step 1: Run the full quality suite**

```bash
npm run quality
```

Expected: PASS. This runs lint, type-check, and the full test suite (unit + api + e2e).

- [ ] **Step 2: If anything failed, fix it and re-run before claiming done**

Do not commit a green-quality claim without seeing the green output. If the suite hangs or fails for reasons unrelated to this change, surface it to the user instead of papering over.

---

## Self-review checklist (run after the plan is fully drafted, not at execution)

- Spec section "Changes → `api/src/thumbnails/router.ts`" → Task 3.
- Spec section "Changes → `api/src/mongo.ts`" → Task 1.
- Spec section "Changes → `publicThumbnailsRouter.get('/:id/data')`" → no code change required; verified the GET response in Task 2's test (Content-Type assertion).
- Spec section "Changes → Artefact schema" → no code change required.
- Spec section "Changes → UI" → Task 4.
- Spec section "Changes → Tests" → Task 2.
- Spec non-goals (sanitization, CSP, viewBox parsing, content sniffing) → no task, as intended.
