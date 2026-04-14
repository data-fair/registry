# Architecture

## Overview

The registry is a centralized store for plugins and file artefacts used by services in the data-fair stack. It provides:

- Versioned storage of npm-packaged plugins (processings, catalogs, applications)
- Raw file storage for binary artefacts (tilesets)
- A client library (`lib-node`) for services to download and cache artefacts at runtime
- Access control with public/private visibility and per-account grants
- Federation support for sharing artefacts across registry instances

## Artefact formats

### npm tarballs

Plugins are packaged as npm tarballs containing a `package.json` with registry-specific metadata (`registry.category`, `registry.processingConfigSchema`, etc.). Each upload creates an artefact scoped to a major version (e.g. `@test/plugin@1`) and a version document with parsed semver fields.

A **2-deep retention** policy keeps only the 2 most recent patch versions per minor branch, preventing unbounded storage growth while allowing a quick rollback.

### File artefacts

Raw files (e.g. `.mbtiles` tilesets) are uploaded directly. They have no versioning -- each upload replaces the previous file. The artefact ID is simply the name (e.g. `terrain`).

## Plugin consumption by services

Services use the `@data-fair/lib-node-registry` client library. The main entry point is `ensureArtefact()`:

```ts
import { ensureArtefact } from '@data-fair/lib-node-registry'

const { path, version, downloaded } = await ensureArtefact({
  registryUrl: 'https://registry.example.com',
  secretKey: process.env.REGISTRY_SECRET,
  artefactId: '@scope/plugin@1',
  version: '1.2',   // resolves to latest 1.2.x
  cacheDir: '/data/plugins'
})
```

The flow:

1. Resolve the requested version via `GET /api/v1/artefacts/{id}/versions/{version}`
2. Check the local cache (`cacheDir`) for a matching version
3. If not cached, download the tarball and extract it
4. Clean up old cached versions (keeps current + previous)

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

## Registry federation

Federation allows a downstream registry to pull artefacts from an upstream registry on behalf of its accounts.

API keys have two types:

- **upload** -- Used by CI pipelines to push artefacts. Created by superadmins.
- **federation** -- Used by downstream registries. Scoped to an account (the `owner` field) and can only be created by accounts that have been granted access.

A downstream registry authenticates to the upstream using a federation key, then proxies artefact downloads to its own consumers.

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

## Storage backends

Tarball and file storage is pluggable:

- **Filesystem** (`config.filesStorage = 'fs'`) -- Files stored under `config.dataDir/tarballs/`. Default for development.
- **S3** (`config.filesStorage = 's3'`) -- Uses AWS SDK v3 with connection pooling. Recommended for production.

Both backends implement the same interface: `writeStream`, `readStream`, `delete`, `exists`, `clean`.

## Version resolution

Version queries support multiple granularities:

| Query | Resolves to |
|-------|-------------|
| `1.2.3` | Exact match |
| `1.2` | Latest stable `1.2.x` |
| `1` | Latest stable `1.x.y` |
| `1.2.3-beta.1` | Exact prerelease match |

Stable queries (`1.2`, `1`) exclude prerelease versions.
