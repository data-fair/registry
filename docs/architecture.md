# Architecture

## Overview

The registry is a centralized store for plugins and file artefacts used by services in the data-fair stack. It provides:

- Versioned storage of npm-packaged plugins (processings, catalogs, applications)
- Raw file storage for binary artefacts (tilesets)
- A client library (`lib-node`) for services to download and cache artefacts at runtime
- Access control with public/private visibility and per-account grants
- One-way mirroring from upstream registries (remote registries)
- Federation support via read API keys for downstream consumers

## Artefact formats

### npm artefacts

Plugins are packaged as npm tarballs. Each artefact identifies a single
*ref* (a release major or a dev branch), holding one mutable tarball per
architecture under `tarballs: { [arch]: { path, size, uploadedAt, uploadedBy } }`.
The convention for the artefact id is `<packageName>@<ref>` — for example
`@data-fair/processing-gpkg@1` for the 1.x release line and
`@data-fair/processing-gpkg@main` for a rolling dev build. The registry
treats the id as opaque; the recommended convention is enforced only at
the operator level.

Each upload replaces the tarball in the named arch slot. Other arch slots
are untouched. The artefact doc's `version` mirrors the manifest's
`package.json#version` for display only — there is no semver parsing,
resolver, or retention policy.

### File artefacts

Raw files (e.g. `.mbtiles` tilesets) are uploaded directly. They have no
versioning — each upload replaces the previous file. The artefact id is
simply the name.

### spa artefacts

`spa` artefacts store a single built-SPA tarball (npm-pack-shaped: files
under a `package/` prefix). On upload the registry extracts the tarball into
files-storage and serves the extracted content statically under:

```
/apps/<packageName>/<major>.<minor>/<...filePath>
```

**One artefact per maintained minor line.** The artefact id is `<packageName>@<major>.<minor>` — for example `@data-fair/app-charts@0.30` for the 0.30.x release line. Uploading a patch release replaces the tarball and the extracted tree in place (no version resolver, analogous to how `npm` replaces a per-arch slot).

**Two-tier access:**

- `index.html` and the bare directory path (`/apps/<packageName>/<major>.<minor>/`) require the internal `x-secret-key` header (`config.secretKeys.internalServices`). A request without the key receives a 404 so existence is not leaked.
- All other files (JS, CSS, fonts, `config-schema.json`, …) are served publicly and unauthenticated. JS and CSS assets built by Vite with content-hashed names carry `Cache-Control: public, max-age=31536000, immutable`; other files use `max-age=300`.

`public` / `privateAccess` / access grants gate listing, metadata management, and the `GET /api/v1/artefacts/:id/spa-tarball` download endpoint — they have no effect on the public static asset tier.

**Federation** uses `GET /api/v1/artefacts/:id/spa-tarball` to download the raw tarball (authenticated like npm/file downloads), then re-extracts it locally so the downstream registry can serve the static files itself. The sync timestamp comparison uses `dataUpdatedAt` so an unchanged artefact is never re-downloaded.

## Plugin consumption by services

Services use the `@data-fair/lib-node-registry` client library. The main entry point is `ensureArtefact()`:

```typescript
import { ensureArtefact } from '@data-fair/lib-node-registry'

const { path, version, dataUpdatedAt, downloaded } = await ensureArtefact({
  registryUrl: 'https://registry.example.com',
  secretKey: process.env.REGISTRY_SECRET,
  artefactId: '@scope/plugin@1',  // ref id
  architecture: process.arch,
  cacheDir: '/data/plugins'
})
```

The flow:

1. Fetch `GET /api/v1/artefacts/<id>` to read the artefact doc.
2. Compare `dataUpdatedAt` against the local cache. If unchanged, return
   the cached extraction.
3. Otherwise download `GET /api/v1/artefacts/<id>/tarball?architecture=<arch>`
   (with noarch fallback) and extract to the cache.

Authentication uses an internal secret passed as the `x-secret-key` header, configured in `config.secretKeys.internalServices`.

## Tileset sync to tileserver

Tilesets are stored as file-format artefacts. A service (e.g. a tileserver wrapper) can use `ensureArtefact()` at startup to download the latest tileset file, then load it into the tileserver. The caching layer ensures that restarts don't re-download unchanged files.

Upload is typically done from CI:

```bash
curl -X POST "https://registry.example.com/api/v1/artefacts/file/terrain" \
  -H "x-api-key: $REGISTRY_API_KEY" \
  -F "file=@output/terrain.mbtiles" \
  -F "category=tileset"
```

## Remote registries

Remote registries allow a local registry instance to mirror selected artefacts from upstream registries. This is a one-way pull: the local instance downloads artefacts from the remote and keeps them in sync.

### Configuration

Each remote registry is stored with:

- **URL** (used as `_id`) -- The base URL of the upstream registry.
- **Name** -- A human-readable label for the admin UI.
- **Encrypted API key** -- A read API key issued by the upstream, encrypted at rest with AES-256-CBC (see [Encryption](#encryption) below).

Admins configure remote registries, browse available artefacts on the upstream, and select which ones to mirror locally.

### Sync behavior

Mirrored artefacts carry an `origin` field set to the remote registry URL. Sync works differently by format:

- **npm artefacts** — Each `tarballs[arch]` slot is compared by `uploadedAt`. New/changed slots are downloaded; slots pruned upstream are deleted locally.
- **file artefacts** -- The file is re-downloaded when the remote's `updatedAt` is more recent than the local copy.
- **spa artefacts** -- The tarball is downloaded via `GET /api/v1/artefacts/:id/spa-tarball` and re-extracted locally when the remote's `dataUpdatedAt` is more recent than the local copy.

Sync runs automatically once per day and can be triggered on-demand via `POST /api/v1/remote-registries/:id/sync` (returns 202). A distributed lock (`@data-fair/lib-node/locks`) prevents concurrent syncs of the same remote.

### Integration protections

Mirrored artefacts are read-only with respect to uploads and most metadata:

- Uploading a new version to a mirrored npm artefact returns **409**.
- Deleting a mirrored artefact returns **403** (unselect the mirror instead).
- PATCH only allows `public` and `privateAccess` on mirrored artefacts; other fields return **403**.

Unselecting an artefact or deleting the remote registry removes the `origin` field, unlocking the artefact for local management.

### Read API keys

Read API keys are the authentication mechanism that remote registries use to access the upstream. They are scoped to an account (`owner` field) and can only be created by accounts that have been granted access. The upstream filters artefact visibility based on the key owner's `privateAccess` grants.

## Access model

### Visibility

Each artefact has:

- `public` (boolean) -- If true, visible to everyone including anonymous users.
- `privateAccess` (array) -- List of `{type, id}` accounts that can see the artefact even if it's not public.

The listing endpoint combines these into a single filter so users only see artefacts they're allowed to access.

### Download authorization

Seeing an artefact in the list doesn't grant download access. Downloads require one of:

1. **Internal service auth** -- `x-secret-key` header matching the configured secret. Used by data-fair services.
2. **Session with access grant** -- A logged-in user whose account has been granted access by a superadmin via `POST /api/v1/access-grants`.
3. **Superadmin session** -- Unrestricted access.

### API keys

API keys are hashed with SHA-512 before storage. The cleartext key is returned only once at creation time. Keys can be listed and revoked but never re-read.

### Encryption

Remote registry API keys are stored encrypted rather than hashed, because they must be decrypted at sync time to authenticate against the upstream. The scheme uses AES-256-CBC with a random 16-byte IV per value and a key derived from `SHA-256(config.secretKeys.cipherPassword)`. The encrypted payload is stored as `{ iv, alg, data }` in MongoDB.

## Storage backends

Tarball and file storage is pluggable:

- **Filesystem** (`config.filesStorage = 'fs'`) -- Files stored under `config.dataDir/tarballs/`. Default for development.
- **S3** (`config.filesStorage = 's3'`) -- Uses AWS SDK v3 with connection pooling. Recommended for production.

Both backends implement the same interface: `writeStream`, `readStream`, `delete`, `exists`, `clean`.

