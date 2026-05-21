# Artefact Deprecation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editable `deprecated` boolean to artefacts; deprecated artefacts behave identically to others but are hidden from the default listing and not suggested for new mirroring.

**Architecture:** A new `deprecated` field on the artefact JSON schema, patchable like `public`. The list endpoint hides `deprecated` docs unless `?includeDeprecated=true`. Federation sync copies `deprecated` from the remote (read-only on mirrors); the `remote-artefacts` browse proxy filters out un-selected deprecated artefacts via a pure, unit-tested helper. The browse UI gains a "show deprecated" toggle and a per-row chip; the detail view gains an edit switch and a deprecation notice.

**Tech Stack:** Express + MongoDB (api), Vue 3 + Vuetify + VJSF (ui), JSON-schema-driven types, Playwright test runner (unit/api/e2e projects).

---

## Background for the implementer

- **Types are generated from JSON schemas.** After editing any `schema.js`, run `npm run build-types`. It regenerates `.type/` directories (git-ignored) and the VJSF form components under `ui/src/components/vjsf/` (git-tracked).
- **The dev API auto-reloads.** `api` runs under `nodemon -e js,ts,json`, so regenerated `.type/*.js` files are picked up automatically — no manual restart. Per `AGENTS.md`, never start/stop dev processes yourself.
- **Tests** run against the already-running dev stack. Run one api file with:
  `npm run test-api -- tests/<file>.api.spec.ts -g "<test name substring>"`
  Run one unit file with:
  `npm run test-unit -- tests/<file>.unit.spec.ts`
  The `api` project depends on a `state-setup` fixture that runs automatically.
- **Editable-metadata form:** the artefact detail page renders a VJSF form generated from `api/doc/artefacts/patch-req/schema.js`, which picks a subset of artefact fields via `makePatchSchema([...])`.
- **Mirrored artefacts:** `PATCH /:id` rejects any field other than `public`/`privateAccess` when the artefact has an `origin`. `deprecated` is intentionally NOT added to that allow-list — on a mirror it is read-only and comes from sync.

## File overview

| File | Change |
|------|--------|
| `api/types/artefact/schema.js` | Add `deprecated` boolean property |
| `api/doc/artefacts/patch-req/schema.js` | Add `deprecated` to the patchable-fields list |
| `api/src/artefacts/router.ts` | `GET /` hides deprecated unless `?includeDeprecated=true` |
| `api/src/remote-registries/sync.ts` | Copy `deprecated` from remote in both sync functions |
| `api/src/remote-registries/operations.ts` | **New** — pure `filterSuggestedArtefacts` helper |
| `api/src/remote-registries/router.ts` | `remote-artefacts` proxy uses the helper |
| `ui/src/pages/index.vue` | "Show deprecated" toggle + per-row chip |
| `ui/src/components/artefact-admin.vue` | Seed `deprecated` into the edit form |
| `ui/src/pages/artefacts/[id].vue` | Deprecation notice alert |
| `tests/artefacts.api.spec.ts` | api tests for patch + list behavior |
| `tests/remote-registries-operations.unit.spec.ts` | **New** — unit tests for the helper |

---

## Task 1: Add the `deprecated` field to the artefact schema

**Files:**
- Modify: `api/types/artefact/schema.js`
- Modify: `api/doc/artefacts/patch-req/schema.js`
- Test: `tests/artefacts.api.spec.ts`

- [ ] **Step 1: Write the failing test**

In `tests/artefacts.api.spec.ts`, add a new `test.describe` block as the LAST nested block inside the top-level `test.describe('Artefacts', ...)` — i.e. immediately after the closing of the `test.describe('Group suggestions', ...)` block and before the final `})` that closes `'Artefacts'`:

```ts
  test.describe('Deprecation', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/npm/' + encodeURIComponent('@test/pkg@1'), form, { headers: form.getHeaders() })
    })

    test('PATCH can set and unset the deprecated flag', async () => {
      const ax = await superAdmin
      const id = encodeURIComponent('@test/pkg@1')
      const setRes = await ax.patch('/api/v1/artefacts/' + id, { deprecated: true })
      expect(setRes.data.deprecated).toBe(true)
      const unsetRes = await ax.patch('/api/v1/artefacts/' + id, { deprecated: false })
      expect(unsetRes.data.deprecated).toBe(false)
    })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test-api -- tests/artefacts.api.spec.ts -g "PATCH can set and unset the deprecated flag"`
Expected: FAIL — the PATCH request returns HTTP 400 because the patch-request schema has `additionalProperties: false` and does not yet know `deprecated`.

- [ ] **Step 3: Add `deprecated` to the artefact schema**

In `api/types/artefact/schema.js`, insert a `deprecated` property immediately after the `public` property block (after its closing `},` on the line before `privateAccess:`):

```js
    deprecated: {
      type: 'boolean',
      title: 'Deprecated',
      'x-i18n-title': { fr: 'Obsolète' },
      layout: 'switch',
      default: false
    },
```

- [ ] **Step 4: Add `deprecated` to the patchable-fields list**

In `api/doc/artefacts/patch-req/schema.js`, change the `makePatchSchema` argument to include `'deprecated'`:

```js
const schema = jsonSchema(ArtefactSchema)
  .makePatchSchema(['title', 'description', 'group', 'documentation', 'public', 'deprecated', 'privateAccess'])
  .schema
```

- [ ] **Step 5: Regenerate types and VJSF components**

Run: `npm run build-types`
Expected: completes with no error. It regenerates the git-ignored `.type/` directories and updates `ui/src/components/vjsf/vjsf-patch-req-en.vue` and `vjsf-patch-req-fr.vue` (a `deprecated` switch is added to the generated form).

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test-api -- tests/artefacts.api.spec.ts -g "PATCH can set and unset the deprecated flag"`
Expected: PASS. (The dev API auto-reloads the regenerated validation code.)

- [ ] **Step 7: Verify types compile**

Run: `npm run check-types`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add api/types/artefact/schema.js api/doc/artefacts/patch-req/schema.js ui/src/components/vjsf/ tests/artefacts.api.spec.ts
git commit -m "feat: add deprecated boolean to artefact schema"
```

---

## Task 2: Hide deprecated artefacts from the default listing

**Files:**
- Modify: `api/src/artefacts/router.ts` (the `GET /` handler)
- Test: `tests/artefacts.api.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/artefacts.api.spec.ts`, add these two tests inside the `test.describe('Deprecation', ...)` block created in Task 1, after the existing `'PATCH can set and unset the deprecated flag'` test:

```ts
    test('deprecated artefacts are excluded from the default list', async () => {
      const ax = await superAdmin
      await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { deprecated: true })
      const list = await ax.get('/api/v1/artefacts')
      expect(list.data.count).toBe(0)
      expect(list.data.results).toEqual([])
    })

    test('deprecated artefacts appear with includeDeprecated=true', async () => {
      const ax = await superAdmin
      await ax.patch('/api/v1/artefacts/' + encodeURIComponent('@test/pkg@1'), { deprecated: true })
      const list = await ax.get('/api/v1/artefacts?includeDeprecated=true')
      expect(list.data.count).toBe(1)
      expect(list.data.results[0]._id).toBe('@test/pkg@1')
    })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test-api -- tests/artefacts.api.spec.ts -g "deprecated artefacts"`
Expected: FAIL — `'excluded from the default list'` fails because the deprecated artefact is still listed (`count` is 1, not 0). `'appear with includeDeprecated=true'` passes already, but both must be green after Step 3.

- [ ] **Step 3: Add the filter to the list endpoint**

In `api/src/artefacts/router.ts`, in the `GET /` handler, locate the format-filter block:

```ts
    // Format filter
    if (req.query.format) {
      const allowedFormats = ['npm', 'file']
      if (!allowedFormats.includes(req.query.format as string)) {
        throw httpError(400, `invalid format, must be one of: ${allowedFormats.join(', ')}`)
      }
      filter.format = req.query.format as Artefact['format']
    }
```

Immediately after that block (before `const { results, count } = await listArtefacts(...)`), add:

```ts
    // Deprecated artefacts are hidden from the default listing; an explicit
    // flag brings them back. `$ne: true` also matches docs missing the field.
    if (req.query.includeDeprecated !== 'true') {
      filter.deprecated = { $ne: true }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test-api -- tests/artefacts.api.spec.ts -g "deprecated artefacts"`
Expected: PASS — both tests green.

- [ ] **Step 5: Run the full artefacts api file to check for regressions**

Run: `npm run test-api -- tests/artefacts.api.spec.ts`
Expected: PASS — all tests in the file (existing list tests still pass; non-deprecated artefacts are unaffected).

- [ ] **Step 6: Commit**

```bash
git add api/src/artefacts/router.ts tests/artefacts.api.spec.ts
git commit -m "feat: hide deprecated artefacts from default list"
```

---

## Task 3: Sync the `deprecated` flag from remote registries

**Files:**
- Modify: `api/src/remote-registries/sync.ts`

There is no automated test for this step: the codebase has no cross-registry sync harness, and this is a one-line metadata copy placed beside the existing `category`/`title` copies (themselves untested). It is verified by type-check, lint, and the manual UI check in Task 7.

- [ ] **Step 1: Copy `deprecated` in the npm sync path**

In `api/src/remote-registries/sync.ts`, in `syncNpmArtefact`, find the `$set` object of the `updateOne` call. It currently starts:

```ts
        $set: {
          packageName: remoteArtefact.packageName,
          version: remoteArtefact.version,
          licence: remoteArtefact.licence,
          category: remoteArtefact.category,
```

Add a `deprecated` line right after `category`:

```ts
        $set: {
          packageName: remoteArtefact.packageName,
          version: remoteArtefact.version,
          licence: remoteArtefact.licence,
          category: remoteArtefact.category,
          deprecated: !!remoteArtefact.deprecated,
```

(Unconditional `!!` so both deprecation and un-deprecation propagate.)

- [ ] **Step 2: Copy `deprecated` in the file sync path**

In the same file, in `syncFileArtefact`, find the `$set` object inside the `if (!local || local.updatedAt < remoteArtefact.updatedAt)` branch. It currently includes:

```ts
        $set: {
          filePath,
          fileName,
          ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
          category: remoteArtefact.category,
```

Add a `deprecated` line right after `category`:

```ts
        $set: {
          filePath,
          fileName,
          ...(typeof remoteArtefact.size === 'number' ? { size: remoteArtefact.size } : {}),
          category: remoteArtefact.category,
          deprecated: !!remoteArtefact.deprecated,
```

(The `else` branch — file unchanged — is intentionally left alone: an upstream metadata-only patch bumps `updatedAt`, so deprecation changes always go through this branch.)

- [ ] **Step 3: Verify types compile and lint passes**

Run: `npm run check-types && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add api/src/remote-registries/sync.ts
git commit -m "feat: sync deprecated flag from remote registries"
```

---

## Task 4: Hide un-selected deprecated artefacts from mirror suggestions

**Files:**
- Create: `api/src/remote-registries/operations.ts`
- Create: `tests/remote-registries-operations.unit.spec.ts`
- Modify: `api/src/remote-registries/router.ts` (the `GET /:id/remote-artefacts` handler)

- [ ] **Step 1: Write the failing unit test**

Create `tests/remote-registries-operations.unit.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { filterSuggestedArtefacts } from '../api/src/remote-registries/operations.ts'

test.describe('filterSuggestedArtefacts', () => {
  test('keeps non-deprecated artefacts and recomputes count', () => {
    const listing = { results: [{ _id: 'a' }, { _id: 'b' }], count: 2 }
    const out = filterSuggestedArtefacts(listing, [])
    expect(out.results.map(a => a._id)).toEqual(['a', 'b'])
    expect(out.count).toBe(2)
  })

  test('drops a deprecated artefact that is not selected', () => {
    const listing = { results: [{ _id: 'a' }, { _id: 'b', deprecated: true }], count: 2 }
    const out = filterSuggestedArtefacts(listing, [])
    expect(out.results.map(a => a._id)).toEqual(['a'])
    expect(out.count).toBe(1)
  })

  test('keeps a deprecated artefact that is already selected', () => {
    const listing = { results: [{ _id: 'a' }, { _id: 'b', deprecated: true }], count: 2 }
    const out = filterSuggestedArtefacts(listing, ['b'])
    expect(out.results.map(a => a._id)).toEqual(['a', 'b'])
    expect(out.count).toBe(2)
  })
})
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npm run test-unit -- tests/remote-registries-operations.unit.spec.ts`
Expected: FAIL — the module `api/src/remote-registries/operations.ts` does not exist yet.

- [ ] **Step 3: Create the pure helper**

Create `api/src/remote-registries/operations.ts`:

```ts
// Pure helpers for the remote-registries module — unit-testable, no I/O.

type RemoteArtefact = { _id: string, deprecated?: boolean }
type RemoteListing<T extends RemoteArtefact> = { results: T[], count: number }

// Drop deprecated artefacts from a remote registry's listing unless they are
// already selected for mirroring. A deprecated artefact must not be suggested
// for new mirroring, but already-mirrored ones stay visible so the admin can
// still manage them (e.g. unselect). `count` is recomputed to match.
export const filterSuggestedArtefacts = <T extends RemoteArtefact> (
  listing: RemoteListing<T>,
  selectedArtefacts: string[]
): RemoteListing<T> => {
  const selected = new Set(selectedArtefacts)
  const results = listing.results.filter(a => !a.deprecated || selected.has(a._id))
  return { results, count: results.length }
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npm run test-unit -- tests/remote-registries-operations.unit.spec.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Wire the helper into the `remote-artefacts` endpoint**

In `api/src/remote-registries/router.ts`:

First, add the import near the other local imports at the top of the file (after the `import * as patchReqBody ...` line):

```ts
import { filterSuggestedArtefacts } from './operations.ts'
```

Then, in the `GET /:id/remote-artefacts` handler, replace this block:

```ts
    const size = Math.min(parseInt(req.query.size as string) || 100, 100)
    const skip = parseInt(req.query.skip as string) || 0
    const params: Record<string, string> = { size: String(size), skip: String(skip) }
    if (req.query.q) params.q = req.query.q as string

    const remote = await ax.get('/api/v1/artefacts', { params })
    res.json(remote.data)
```

with:

```ts
    const size = Math.min(parseInt(req.query.size as string) || 100, 100)
    const skip = parseInt(req.query.skip as string) || 0
    // Ask the remote for deprecated artefacts too, then drop the ones that are
    // not already selected — a deprecated artefact is not suggested for new
    // mirroring but stays visible if it is already mirrored.
    const params: Record<string, string> = { size: String(size), skip: String(skip), includeDeprecated: 'true' }
    if (req.query.q) params.q = req.query.q as string

    const remote = await ax.get('/api/v1/artefacts', { params })
    res.json(filterSuggestedArtefacts(remote.data, doc.selectedArtefacts))
```

- [ ] **Step 6: Verify types compile and lint passes**

Run: `npm run check-types && npm run lint`
Expected: PASS, no errors.

- [ ] **Step 7: Commit**

```bash
git add api/src/remote-registries/operations.ts api/src/remote-registries/router.ts tests/remote-registries-operations.unit.spec.ts
git commit -m "feat: hide un-selected deprecated artefacts from mirror suggestions"
```

---

## Task 5: Browse list UI — "show deprecated" toggle and chip

**Files:**
- Modify: `ui/src/pages/index.vue`

No automated test (the spec scopes UI verification to manual checks); verified by lint, type-check, and the manual check in Task 7.

- [ ] **Step 1: Add the `showDeprecated` state**

In `ui/src/pages/index.vue`, in the `<script setup>` block, find the Browse tab state:

```ts
const sort = ref('dataUpdatedAt')
const pageSize = 20
const page = ref(1)
```

Add a `showDeprecated` ref right after `sort`:

```ts
const sort = ref('dataUpdatedAt')
const showDeprecated = ref(false)
const pageSize = 20
const page = ref(1)
```

- [ ] **Step 2: Pass the flag to the fetch params**

In the same file, change the `fetchParams` computed:

```ts
const fetchParams = computed(() => ({
  size: pageSize,
  skip: (page.value - 1) * pageSize,
  sort: sort.value,
  ...(q.value ? { q: q.value } : {}),
  ...(category.value ? { category: category.value } : {})
}))
```

to:

```ts
const fetchParams = computed(() => ({
  size: pageSize,
  skip: (page.value - 1) * pageSize,
  sort: sort.value,
  ...(q.value ? { q: q.value } : {}),
  ...(category.value ? { category: category.value } : {}),
  ...(showDeprecated.value ? { includeDeprecated: true } : {})
}))
```

- [ ] **Step 3: Add the checkbox to the filter row**

In the `<template>`, in the Browse tab filter `<v-row class="mb-4">`, after the sort `<v-col cols="auto">` block (the one containing `<v-btn-toggle v-model="sort" ...>`), add a new column:

```html
        <v-col cols="auto">
          <v-checkbox
            v-model="showDeprecated"
            color="primary"
            density="compact"
            hide-details
            :label="t('showDeprecated')"
          />
        </v-col>
```

- [ ] **Step 4: Add the per-row deprecated chip**

In the artefacts table, in the name `<td>`, there is an admin-only mirror chip:

```html
                <v-chip
                  v-if="adminMode && artefact.origin"
                  size="x-small"
                  color="info"
                  class="ml-2"
                >
                  {{ t('mirror') }}
                </v-chip>
```

Immediately after that `</v-chip>` (and before the `<br>`), add:

```html
                <v-chip
                  v-if="artefact.deprecated"
                  size="x-small"
                  color="warning"
                  class="ml-2"
                >
                  {{ t('deprecated') }}
                </v-chip>
```

- [ ] **Step 5: Add the i18n strings**

In the `<i18n lang="yaml">` block, add two keys to the `fr:` map (e.g. after `mirror: miroir`):

```yaml
  deprecated: "obsol\xE8te"
  showDeprecated: "Afficher les obsol\xE8tes"
```

and the matching keys to the `en:` map (after `mirror: mirror`):

```yaml
  deprecated: deprecated
  showDeprecated: Show deprecated
```

- [ ] **Step 6: Verify lint and types**

Run: `npm run lint && npm run check-types`
Expected: PASS, no errors.

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/index.vue
git commit -m "feat: show-deprecated toggle and chip in artefact browse list"
```

---

## Task 6: Artefact detail view — edit switch and deprecation notice

**Files:**
- Modify: `ui/src/components/artefact-admin.vue`
- Modify: `ui/src/pages/artefacts/[id].vue`

The `deprecated` switch itself already appears in the VJSF editable-metadata form (the form components were regenerated in Task 1). This task seeds its initial value into the edit form and adds a viewer-facing notice.

- [ ] **Step 1: Seed `deprecated` into the edit form**

In `ui/src/components/artefact-admin.vue`, find the `watch` that re-seeds `editData`:

```ts
watch(() => artefact, () => {
  editData.value = {
    title: artefact.title || {},
    description: artefact.description || {},
    group: artefact.group || {},
    documentation: artefact.documentation ?? null,
    public: artefact.public ?? false,
    privateAccess: artefact.privateAccess ? [...artefact.privateAccess] : []
  }
  originalEditData.value = JSON.stringify(editData.value)
}, { immediate: true })
```

Add a `deprecated` line after `public`:

```ts
watch(() => artefact, () => {
  editData.value = {
    title: artefact.title || {},
    description: artefact.description || {},
    group: artefact.group || {},
    documentation: artefact.documentation ?? null,
    public: artefact.public ?? false,
    deprecated: artefact.deprecated ?? false,
    privateAccess: artefact.privateAccess ? [...artefact.privateAccess] : []
  }
  originalEditData.value = JSON.stringify(editData.value)
}, { immediate: true })
```

No change is needed in `patchAction` — it already spreads `editData.value`, and `deprecated` is a plain boolean needing no null-coercion.

- [ ] **Step 2: Add the deprecation notice to the detail page**

In `ui/src/pages/artefacts/[id].vue`, find the mirror banner alert near the top of the `<template>`:

```html
    <!-- Mirror banner (admin) -->
    <v-alert
      v-if="adminMode && artefact.origin"
      type="info"
      variant="tonal"
      class="mb-4"
    >
      {{ t('mirroredFrom', { origin: artefact.origin }) }}
    </v-alert>
```

Immediately after that `</v-alert>`, add:

```html
    <!-- Deprecation notice -->
    <v-alert
      v-if="artefact.deprecated"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      {{ t('deprecatedNotice') }}
    </v-alert>
```

- [ ] **Step 3: Add the i18n string**

In the `<i18n lang="yaml">` block of `ui/src/pages/artefacts/[id].vue`, add one key to the `fr:` map (e.g. after `mirroredFrom: ...`):

```yaml
  deprecatedNotice: "Cet artefact est obsol\xE8te. Il reste disponible mais n'est plus recommand\xE9."
```

and to the `en:` map (after `mirroredFrom: ...`):

```yaml
  deprecatedNotice: "This artefact is deprecated. It remains available but is no longer recommended."
```

- [ ] **Step 4: Verify lint and types**

Run: `npm run lint && npm run check-types`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/artefact-admin.vue ui/src/pages/artefacts/[id].vue
git commit -m "feat: deprecation switch and notice on artefact detail page"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full quality gate**

Run: `npm run quality`
Expected: PASS — this runs lint, `build-types`, `check-types`, and the full test suite (unit, api, e2e).

- [ ] **Step 2: If the e2e suite flags the edited metadata form**

`tests/artefact-admin.e2e.spec.ts` exercises the editable-metadata form. The new `deprecated` switch adds one field to that form. If an assertion in that spec breaks purely because of the extra field, update the spec so it still reflects the intended form — do not remove the `deprecated` field. If the suite is green, skip this step.

- [ ] **Step 3: Manual smoke check in the browser**

With the dev stack running, as a superadmin:
1. Open an artefact detail page → toggle the `Deprecated` switch in "Editable Metadata" → Save.
2. Go to the browse list (`/`) → confirm the artefact is gone from the default list.
3. Tick "Show deprecated" → confirm the artefact reappears with a "deprecated" chip.
4. Open the artefact detail page → confirm the amber deprecation notice shows.
5. Un-deprecate it → confirm it returns to the default list.

- [ ] **Step 4: Final commit (only if Step 2 changed a file)**

```bash
git add tests/artefact-admin.e2e.spec.ts
git commit -m "test: account for deprecated field in artefact-admin e2e"
```

---

## Done

All spec requirements are covered: editable `deprecated` boolean (Tasks 1, 6), hidden-by-default list with `includeDeprecated` opt-in (Task 2), federation sync (Task 3), suggestion filtering (Task 4), browse-list toggle for everyone (Task 5), and detail-page notice (Task 6).
