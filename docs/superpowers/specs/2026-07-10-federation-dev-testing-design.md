# Testing federation sync in dev and CI

Date: 2026-07-10
Depends on: `2026-07-09-federation-sync-ui-design.md` (shipped on `feat-better-sync-ui`)

## Problem

Remote-registry sync cannot be exercised anywhere.

- **Dev runs exactly one registry.** `.zellij.kdl` starts a single `api` pane. Sync mirrors *from* an upstream registry; there isn't one.
- **Self-mirroring is impossible by design.** Point the registry at its own URL and every remote artefact is also a local artefact, so every selection is rejected:

  ```js
  // api/src/remote-registries/router.ts:161
  const existing = await mongo.artefacts.findOne({ _id: artefactId })
  if (existing && !existing.origin) throw httpError(409, 'a locally-uploaded artefact with this ID already exists')
  ```

- **The mirror path has never run under test.** The only `lastSyncStatus: 'success'` in the suite is the zero-artefact case; the one-artefact test asserts a DNS failure. `syncNpmArtefact` and `syncFileArtefact` — download the tarball, write it into files-storage, set `origin`, prune the old file — are executed by nothing.

The third point is the real motivation. It is the highest-consequence untested code in the service.

## Approach

Run a **second real registry process** as the upstream. Not a mock: a mock cannot catch a read-key, access-grant, or download-permission bug, and it drifts from the real API's responses.

This needs **no api code changes**. `api/config/custom-environment-variables.js` already maps `PORT`, `MONGO_URL` and `DATA_DIR`, and node-config gives env vars precedence over `development.js`. The upstream is the same process with three variables changed:

| | downstream (existing) | upstream (new) |
|---|---|---|
| port | `DEV_API_PORT` | `DEV_UPSTREAM_API_PORT` |
| mongo db | `data-fair-registry-development` | `data-fair-registry-upstream` |
| dataDir | `./data` | `./data-upstream` |

Separate `DATA_DIR` matters: `filesStorage.clean()` does `rm -rf ${dataDir}/tarballs`, so the downstream's `test-env` wipe must not be able to reach the upstream's bytes.

**No nginx route.** A registry's `_id` *is* its base URL, and the downstream calls the upstream server-to-server. `http://localhost:$DEV_UPSTREAM_API_PORT` works directly. The upstream has no UI and needs none.

Both processes share simple-directory and the events service. That is what makes a **real read-key handshake** possible: the upstream mints a key owned by org `test1`, and the downstream authenticates with it exactly as a production mirror would.

### Accepted cost

This adds a second always-on node process and a second Mongo database to every developer's loop, to test one feature. It is a real, permanent cost. It is judged worth it because the mirror path is unexercised and high-consequence, and because a mock upstream would not have caught an auth or access bug.

## Dev environment

`dev/init-env.sh` gains:

```sh
DEV_UPSTREAM_API_PORT=$((RANDOM_NB + 6))
```

Slot `+6` is currently unused (`+5` is maildev SMTP, `+10` is mongo).

**Existing `.env` files predate this.** Re-running `init-env.sh` randomizes every port and disturbs a running stack, so an existing checkout should append the one line by hand (e.g. `DEV_UPSTREAM_API_PORT=15423` when the base is `15417`).

`api/package.json` gains a `dev-upstream` script — a sibling of `dev` that logs to `dev/logs/dev-api-upstream.log` rather than clobbering `dev-api.log`:

```json
"dev-upstream": "mkdir -p ../dev/logs && NODE_ENV=development EVENTS_LOG_LEVEL=warn nodemon -e js,ts,json index.ts 2>&1 | tee ../dev/logs/dev-api-upstream.log"
```

Root `package.json` gains:

```json
"dev-api-upstream": "dotenv -- bash -c 'PORT=$DEV_UPSTREAM_API_PORT MONGO_URL=mongodb://localhost:$MONGO_PORT/data-fair-registry-upstream DATA_DIR=./data-upstream npm -w api run dev-upstream'"
```

`dotenv --` loads `.env` into the environment so the shell can expand the ports before node starts; node-config then reads `PORT`/`MONGO_URL`/`DATA_DIR` from `process.env`.

Also:

- `.zellij.kdl` — an `api-upstream` pane beside `api`.
- `dev/status.sh` — an upstream health line.
- `.gitignore` — `data-upstream/` (the existing `data/` pattern does not match it).
- `AGENTS.md` — document the pane and how to exercise sync locally.

The upstream runs its own 24h `syncAllRemoteRegistries` timer. Harmless: it has no remotes.

## Test support

`tests/support/axios.ts` gains the upstream mirror of what already exists. `axiosAuth` currently hardcodes the downstream `baseURL`, so it grows one optional option (default unchanged); `directoryUrl` stays as-is, since both registries share simple-directory:

```ts
export const upstreamBaseURL = `http://localhost:${process.env.DEV_UPSTREAM_API_PORT}`

// was: (user, opts?: { adminMode?, org? })
export const axiosAuth = (user: string, opts?: { adminMode?: boolean, org?: string, baseURL?: string }) =>
  _axiosAuth({ ..., axiosOpts: { baseURL: opts?.baseURL ?? baseURL }, directoryUrl })

export const upstreamSuperAdmin = axiosAuth('superadmin', { adminMode: true, baseURL: upstreamBaseURL })
export const upstreamAxiosAuth = (user: string, opts?: { org?: string }) =>
  axiosAuth(user, { ...opts, baseURL: upstreamBaseURL })   // needed to mint the read key as test1-admin1
export const upstreamAxiosWithApiKey = (key: string) => axiosBuilder({ baseURL: upstreamBaseURL, headers: { 'x-api-key': key } })
export const cleanUpstream = async () => { await anonymousAx.delete(`${upstreamBaseURL}/api/test-env`) }
```

`cleanUpstream()` works because the upstream also runs `NODE_ENV=development`, so its `test-env` router is mounted, and a request from localhost is internal.

If `DEV_UPSTREAM_API_PORT` is unset these must throw a message naming the fix, not silently build `http://localhost:undefined`.

## Fixtures

`dev/fixtures.ts` gains a federation section after the existing one. It **hard-fails** on an unreachable upstream — acceptable because the `api-upstream` pane is always on.

1. `GET ${upstream}/api/ping` — on failure exit 1 with: *"upstream registry not reachable at :<port> — is the `api-upstream` zellij pane running?"*
2. Upstream: upload key → npm `@upstream/processing-remote@1` (category `processing`) and file `upstream-terrain` (category `tileset`), both `public: true`.
3. Upstream: access-grant for org `test1` — required before a read key can be minted for it (`api/src/api-keys/router.ts:42`).
4. Upstream: read key owned by org `test1`, minted as `test1-admin1` (its admin, per `dev/resources/organizations.json`). Raw key persisted to `dev/fixtures-output.json` beside the existing upload keys.
5. Downstream: register the upstream as a remote registry with that read key; select both artefacts.
6. **Stop. Do not sync.** Leave "Sync now" for the human to click — that is the point.

Idempotent, like the rest of the file: skip on `409`, skip when the raw key is already in `fixtures-output.json`.

Upstream artefact ids are deliberately disjoint from the local fixture ids. Reusing a local id would hit the `409` guard above.

## Automated test

New `tests/remote-registries-sync.api.spec.ts` (api project). `beforeEach`: `clean()` + `cleanUpstream()`, then seed the upstream (upload key, artefacts, grant, read key).

- **mirrors a real npm artefact**: `lastSyncStatus: 'success'`; locally `origin` = upstream URL, `format: 'npm'`, `packageName`, `version`, `path`, `size > 0`, `hasNativeModules: false`, `syncProgress` = `{done: 1, total: 1}`
- **the bytes actually arrive**: downstream `GET /:id/download` returns a buffer byte-identical to the upstream's
- **re-sync is a no-op**: `dataUpdatedAt` and `path` unchanged (the `dataUpdatedAt` fast path in `syncNpmArtefact`)
- **republish is picked up**: upstream uploads `2.0.0` → sync → `version`, `path`, `dataUpdatedAt` all change
- **mirrored-artefact guards hold**: `PATCH {title}` → `403`, `DELETE` → `403`, `PATCH {public}` → `200`
- **unselect clears `origin`**
- **a file artefact mirrors too**, so `syncFileArtefact` is exercised, not just the npm path

The `403` guards are currently tested against docs whose `origin` was *forced* by `setArtefactOrigin()` in the test-env router. This is the first time they are tested against an artefact that really was mirrored.

## CI

`.github/workflows/reuse-quality.yml` starts a second background API before the tests, and waits for both.

The existing "Start dev API" step has no readiness wait — it races and gets away with it. Add the loop for both rather than leave a latent flake beside a new one.

```yaml
- name: Start upstream registry API
  run: |
    set -a && . ./.env && set +a
    NODE_ENV=development NODE_CONFIG_DIR=$PWD/api/config/ \
      PORT=$DEV_UPSTREAM_API_PORT \
      MONGO_URL=mongodb://localhost:$MONGO_PORT/data-fair-registry-upstream \
      DATA_DIR=./data-upstream \
      node api/index.ts &

- name: Wait for both APIs
  run: |
    set -a && . ./.env && set +a
    for p in $DEV_API_PORT $DEV_UPSTREAM_API_PORT; do
      timeout 60 bash -c "until curl -sf http://localhost:$p/api/ping; do sleep 1; done"
    done
```

CI runs `npm run test-unit && npm run test-api` only; e2e does not need the upstream.

Both CI processes run from the repo root, so their `DATA_DIR`s resolve to `./data` and `./data-upstream` there. (In dev, `npm -w api run dev` has cwd `api/`, so they resolve under `api/`. This inconsistency is pre-existing.)

## Out of scope

- Mirroring between more than two registries.
- An e2e (browser) test of the sync UI against a real upstream.
- Exercising the S3 files-storage backend on either side.
