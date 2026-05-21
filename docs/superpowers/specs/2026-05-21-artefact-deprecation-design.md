# Artefact deprecation — design

Date: 2026-05-21

## Goal

Add a `deprecated` boolean to artefacts. A deprecated artefact behaves exactly
like any other artefact — same access rules, same downloads — with one
difference: it is not listed by default. A query param re-includes it, and the
browse UI exposes that as a toggle. In federation, a deprecated artefact still
syncs normally but is not suggested for mirroring unless already selected.

## Decisions

- **Mirror behavior**: `deprecated` is synced from the remote, read-only on
  mirrors — like `title`/`description`/`category`. If upstream un-deprecates,
  the mirror follows.
- **UI toggle scope**: the "show deprecated" toggle in the browse list is
  visible to everyone, not admin-only. Deprecated artefacts still work and stay
  reachable for anyone needing an older version.
- **Federation suggestion filtering**: approach A — the `remote-artefacts`
  proxy fetches the remote with `includeDeprecated=true`, then drops any result
  that is `deprecated && !selectedArtefacts.includes(_id)`. Already-mirrored
  deprecated artefacts stay visible and manageable; newly-deprecated ones
  disappear from suggestions.

## Changes

### 1. Schema & types

- `api/types/artefact/schema.js`: add a `deprecated` property next to `public`:
  `{ type: 'boolean', layout: 'switch', default: false, title: 'Deprecated',
  'x-i18n-title': { fr: 'Obsolète' } }`. Not `readOnly` — it is editable for
  local artefacts.
- `api/doc/artefacts/patch-req/schema.js`: add `'deprecated'` to the
  `makePatchSchema([...])` list so it becomes a patchable field.
- Run `npm run build-types` to regenerate `.type` directories and the
  `vjsf-patch-req-en`/`vjsf-patch-req-fr` form components.

### 2. List endpoint — `GET /api/v1/artefacts`

In `api/src/artefacts/router.ts`, after the access filter is built:

- Default: `filter.deprecated = { $ne: true }` — matches docs where
  `deprecated` is `false` or absent.
- When `req.query.includeDeprecated === 'true'`: do not add that filter, so
  deprecated and non-deprecated list together.

Applies to everyone, admin included.

### 3. Editing

- `deprecated` appears as a switch in the existing VJSF "Editable Metadata"
  form on the artefact detail page (admin mode), generated from the patch-req
  schema.
- `ui/src/components/artefact-admin.vue`: seed `deprecated` into `editData`
  (`deprecated: artefact.deprecated ?? false`) in the re-seed `watch`.
- `PATCH /:id` mirror-guard is unchanged: `deprecated` stays out of the
  `{public, privateAccess}` allowed set, so editing it on a mirrored artefact
  is rejected — consistent with other synced metadata fields.

### 4. Federation

- `api/src/remote-registries/sync.ts`: in both `syncNpmArtefact` and
  `syncFileArtefact`, copy `deprecated` from the remote artefact into the
  `$set` of the `updateOne`, unconditionally — `deprecated: !!remoteArtefact.deprecated`
  — so both deprecation and un-deprecation propagate. Selected deprecated
  artefacts keep syncing exactly as before.
- `api/src/remote-registries/router.ts`, `GET /:id/remote-artefacts`: pass
  `includeDeprecated: 'true'` to the remote request, then filter the results,
  keeping an artefact only if `!artefact.deprecated ||
  doc.selectedArtefacts.includes(artefact._id)`. Recompute `count` as the
  filtered length. Acceptable because the browse UI is single-page (size 100,
  no pagination controls).

### 5. UI — browse list (`ui/src/pages/index.vue`)

- A "Show deprecated" checkbox in the filter row, visible to everyone. When on,
  the fetch params include `includeDeprecated: true`.
- Deprecated rows get a small "deprecated" chip next to the name (mirroring the
  existing `mirror` chip pattern) so users can distinguish them once shown.
- Add `showDeprecated`/`deprecated` i18n keys (fr/en).

### 6. UI — detail page (`ui/src/pages/artefacts/[id].vue`)

- A tonal warning `v-alert` near the top, shown when `artefact.deprecated`,
  signalling the artefact is deprecated. Visible to all viewers.
- Add a `deprecatedNotice` i18n key (fr/en).

## Testing

- `tests/artefacts.api.spec.ts`:
  - a deprecated artefact is absent from the default `GET /artefacts`;
  - it appears with `?includeDeprecated=true`;
  - `PATCH /:id` can set and unset `deprecated`.
- `tests/remote-registries.api.spec.ts`:
  - a deprecated remote artefact not in `selectedArtefacts` is absent from
    `GET /:id/remote-artefacts`;
  - an already-selected deprecated remote artefact is still present there;
  - sync still mirrors a selected deprecated artefact, and the mirror carries
    `deprecated: true`.

## Out of scope

- Group suggestions (`GET /artefacts/groups`) continue to include deprecated
  artefacts' group values — harmless and arguably correct.
- The existing file-sync "only if newer" branch is unchanged; an upstream
  metadata-only patch already bumps `updatedAt`, so deprecation changes
  propagate on the next sync.
