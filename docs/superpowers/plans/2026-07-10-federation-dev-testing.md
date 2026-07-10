# Federation Dev & CI Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make remote-registry sync exercisable — in dev by clicking "Sync now", and in CI by a test that mirrors real bytes.

**Architecture:** Run a second *real* registry process as the upstream. No api code changes: `PORT`, `MONGO_URL` and `DATA_DIR` are already mapped in `api/config/custom-environment-variables.js`, and node-config gives env vars precedence over `development.js`. The downstream reaches it at `http://localhost:$DEV_UPSTREAM_API_PORT` because a registry's `_id` *is* its base URL — no nginx route needed.

**Tech Stack:** Express + MongoDB (api), Playwright test runner, zellij + docker compose (dev), GitHub Actions (CI).

**Spec:** `docs/superpowers/specs/2026-07-10-federation-dev-testing-design.md`

## Global Constraints

- **Never start, stop, or restart dev processes.** Check them with `bash dev/status.sh`. Logs are in `dev/logs/`. Starting the new `api-upstream` process is a **human step** (see the gate between Task 1 and Task 2) — an agent must not do it.
- **Do not re-run `bash dev/init-env.sh`** on an existing checkout: it randomizes every port and would disturb the running stack. The existing `.env` gets one line appended by hand.
- Types are generated from JSON schemas. Never hand-edit `api/types/**/.type/*`. This plan changes no schema.
- **This plan changes no `api/src` code.** If a task seems to require it, stop and escalate.
- Test projects are matched by filename: `*.unit.spec.ts`, `*.api.spec.ts`, `*.e2e.spec.ts`.
- **Running one file or one test.** `npm run test` is a compound `a && b && c` script, so `npm run test <file>` appends the file to the *last* command only (the e2e project). Use the per-project scripts:
  - `npm run test-api -- tests/remote-registries-sync.api.spec.ts`
  - `npm run test-api -- tests/remote-registries-sync.api.spec.ts -g "mirrors a real npm artefact"`
- Quality gates: `npm run lint-fix`, `npm run check-types`. The repo has a pre-commit hook running the linter — fix lint errors rather than bypassing the hook.
- Upstream and downstream **must** use different `DATA_DIR`s: `filesStorage.clean()` does `rm -rf ${dataDir}/tarballs`, so a shared dir would let the downstream's `test-env` wipe delete the upstream's bytes.
- Upstream artefact ids **must** be disjoint from local fixture ids. Reusing one hits `409 a locally-uploaded artefact with this ID already exists` (`api/src/remote-registries/router.ts:161`).
- A read key requires (a) an authenticated **admin of the owner account**, and (b) an existing **access grant** for that account (`api/src/api-keys/router.ts:33,42`). `test1-admin1` is an admin of org `test1` (`dev/resources/organizations.json`).

## File Structure

| File | Responsibility |
|---|---|
| `dev/init-env.sh` | **Modify.** Allocate `DEV_UPSTREAM_API_PORT` at slot `+6`. |
| `.env` | **Modify (by hand).** Append the one line; do not regenerate. |
| `api/package.json` | **Modify.** Add `dev-upstream` (sibling of `dev`, separate log file). |
| `package.json` | **Modify.** Add `dev-api-upstream` (env overrides + `dotenv --`). |
| `.gitignore` | **Modify.** Ignore `data-upstream/`. |
| `.zellij.kdl` | **Modify.** Add the `api-upstream` pane. |
| `dev/status.sh` | **Modify.** Report the upstream's health. |
| `tests/support/axios.ts` | **Modify.** Upstream axios helpers; `axiosAuth` gains a `baseURL` option. |
| `dev/fixtures.ts` | **Modify.** Seed the upstream, mint the read key, wire the mirror. |
| `tests/remote-registries-sync.api.spec.ts` | **Create.** The first test to execute `syncNpmArtefact`/`syncFileArtefact`. |
| `.github/workflows/reuse-quality.yml` | **Modify.** Start the upstream; wait for both APIs. |
| `AGENTS.md` | **Modify.** Document the pane and how to exercise sync. |

---

### Task 1: The upstream process

Everything needed to *run* a second registry. Nothing yet uses it.

**Files:**
- Modify: `dev/init-env.sh`, `.env`, `api/package.json`, `package.json`, `.gitignore`, `.zellij.kdl`, `dev/status.sh`

**Interfaces:**
- Consumes: nothing.
- Produces: `DEV_UPSTREAM_API_PORT` in the environment; `npm run dev-api-upstream` starts a registry on that port against db `data-fair-registry-upstream` with `DATA_DIR=./data-upstream`.

- [ ] **Step 1: Allocate the port in `dev/init-env.sh`**

Insert after the `MAILDEV_SMTP_PORT` line, inside the heredoc:

```sh
MAILDEV_SMTP_PORT=$((RANDOM_NB + 5))
DEV_UPSTREAM_API_PORT=$((RANDOM_NB + 6))
```

Slot `+6` is free (`+5` is maildev SMTP, `+10` is mongo).

- [ ] **Step 2: Append the port to the existing `.env`**

Do NOT re-run `init-env.sh`. Read the current `DEV_API_PORT` from `.env` and append `DEV_UPSTREAM_API_PORT = DEV_API_PORT + 5` (which equals base `+6`):

```bash
cd /home/alban/data-fair/registry_feat-better-sync-ui
grep -q '^DEV_UPSTREAM_API_PORT=' .env || \
  echo "DEV_UPSTREAM_API_PORT=$(( $(grep '^DEV_API_PORT=' .env | cut -d= -f2) + 5 ))" >> .env
grep DEV_UPSTREAM_API_PORT .env
```

Expected: `DEV_UPSTREAM_API_PORT=15423` (when `DEV_API_PORT=15418`).

Verify it collides with nothing:

```bash
sort -t= -k2 -n .env | grep -v '^$'
```

Expected: `15423` appears exactly once.

- [ ] **Step 3: Add the api workspace script**

In `api/package.json`, add a sibling of `dev`. The separate log file matters — reusing `dev-api.log` would interleave two servers' output:

```json
  "scripts": {
    "dev": "mkdir -p ../dev/logs && NODE_ENV=development EVENTS_LOG_LEVEL=warn nodemon -e js,ts,json index.ts 2>&1 | tee ../dev/logs/dev-api.log",
    "dev-upstream": "mkdir -p ../dev/logs && NODE_ENV=development EVENTS_LOG_LEVEL=warn nodemon -e js,ts,json index.ts 2>&1 | tee ../dev/logs/dev-api-upstream.log"
  },
```

- [ ] **Step 4: Add the root script**

In the root `package.json` `scripts`, after `"dev-api"`:

```json
    "dev-api-upstream": "dotenv -- bash -c 'PORT=$DEV_UPSTREAM_API_PORT MONGO_URL=mongodb://localhost:$MONGO_PORT/data-fair-registry-upstream DATA_DIR=./data-upstream npm -w api run dev-upstream'",
```

`dotenv --` loads `.env` into the environment so the shell expands the ports before node starts; node-config then reads `PORT`/`MONGO_URL`/`DATA_DIR` from `process.env`, which override `development.js`.

`npm -w api run dev-upstream` runs with cwd `api/`, so `./data-upstream` resolves to `api/data-upstream`.

- [ ] **Step 5: Ignore the upstream data dir**

The existing `.gitignore` line `data/` does not match `data-upstream/`. Add below it:

```gitignore
data/
data-upstream/
```

- [ ] **Step 6: Add the zellij pane**

In `.zellij.kdl`, add a third pane to the second row (beside `ui` and `api`):

```kdl
    pane {
      split_direction "vertical"
      pane name="ui" {
        command "bash"
        args "-ic" "nvm use > /dev/null 2>&1 && npm -w ui run dev"
      }
      pane name="api" {
        command "bash"
        args "-ic" "nvm use > /dev/null 2>&1 && npm -w api run dev"
      }
      pane name="api-upstream" {
        command "bash"
        args "-ic" "nvm use > /dev/null 2>&1 && npm run dev-api-upstream"
      }
    }
```

- [ ] **Step 7: Report upstream health in `dev/status.sh`**

`dev/status.sh` runs under `set -euo pipefail`, so an unset variable would abort the whole script. Guard it. In the "Dev processes" block, after the `dev-ui` line:

```bash
check_http "dev-api" "$NGINX/registry/api/ping"
check_http "dev-ui" "$NGINX/registry"
if [ -n "${DEV_UPSTREAM_API_PORT:-}" ]; then
  check_http "dev-api-upstream" "http://localhost:${DEV_UPSTREAM_API_PORT}/api/ping"
else
  printf "%-20s MISSING  DEV_UPSTREAM_API_PORT not set in .env\n" "dev-api-upstream"
fi
```

Note the upstream is probed directly, not through nginx — it has no nginx route by design.

- [ ] **Step 8: Verify the config resolves, without starting a server**

You must NOT start the upstream. Instead confirm node-config resolves the overrides:

```bash
cd /home/alban/data-fair/registry_feat-better-sync-ui
set -a && . ./.env && set +a
cd api && NODE_ENV=development NODE_CONFIG_DIR=$PWD/config \
  PORT=$DEV_UPSTREAM_API_PORT \
  MONGO_URL=mongodb://localhost:$MONGO_PORT/data-fair-registry-upstream \
  DATA_DIR=./data-upstream \
  node -e "const c=require('config'); console.log(JSON.stringify({port:c.get('port'),mongoUrl:c.get('mongoUrl'),dataDir:c.get('dataDir')},null,1))"
```

Expected: `port` is the upstream port, `mongoUrl` ends `/data-fair-registry-upstream`, `dataDir` is `./data-upstream`.

If node-config cannot be loaded that way, instead assert the three env names appear in `api/config/custom-environment-variables.js` and say so in your report — do not start a server to find out.

- [ ] **Step 9: Verify status.sh still runs**

Run: `bash dev/status.sh`
Expected: exits 0; `dev-api-upstream` reports **DOWN** (nobody has started it — correct at this point).

- [ ] **Step 10: Commit**

```bash
git add dev/init-env.sh api/package.json package.json .gitignore .zellij.kdl dev/status.sh
git commit -m "build(dev): run a second registry process as a federation upstream"
```

`.env` is gitignored; it is not part of the commit.

---

## HUMAN STEP — start the upstream

`AGENTS.md` forbids an agent from starting dev processes. Everything below needs the upstream running.

Add the `api-upstream` pane to your zellij session, or in a spare terminal:

```
! npm run dev-api-upstream
```

Confirm with `bash dev/status.sh` — `dev-api-upstream` should read **UP**. Then continue.

---

### Task 2: Upstream test-support helpers

**Files:**
- Modify: `tests/support/axios.ts`

**Interfaces:**
- Consumes: `DEV_UPSTREAM_API_PORT`.
- Produces:
  - `upstreamBaseURL(): string`
  - `upstreamSuperAdmin(): Promise<AxiosInstance>`
  - `upstreamAxiosAuth(user: string, opts?: { org?: string }): Promise<AxiosInstance>`
  - `upstreamAxiosWithApiKey(key: string): AxiosInstance`
  - `cleanUpstream(): Promise<void>`
  - `axiosAuth` gains an optional `baseURL` option (default unchanged).

- [ ] **Step 1: Extend `axiosAuth` and add the upstream helpers**

`upstreamBaseURL` is a **function**, not a const: a module-level throw would break every other spec that imports this file when the var is absent.

Replace the `axiosAuth` declaration and append the rest:

```ts
export const axiosAuth = (user: string, opts?: { adminMode?: boolean, org?: string, baseURL?: string }) => {
  return _axiosAuth({
    email: user + '@test.com',
    password: 'passwd',
    adminMode: opts?.adminMode,
    org: opts?.org,
    axiosOpts: opts?.baseURL ? { baseURL: opts.baseURL } : axiosOpts,
    directoryUrl
  })
}
```

Then append at the end of the file:

```ts
// --- federation upstream --------------------------------------------------
// A second registry process (see docs/superpowers/specs/2026-07-10-federation-dev-testing-design.md).
// Lazily resolved: this module is imported by every spec, most of which do not need the upstream.

const upstreamPort = (): string => {
  const port = process.env.DEV_UPSTREAM_API_PORT
  if (!port) {
    throw new Error('DEV_UPSTREAM_API_PORT is not set — append it to .env (DEV_API_PORT + 5), do not re-run dev/init-env.sh')
  }
  return port
}

export const upstreamBaseURL = () => `http://localhost:${upstreamPort()}`

export const upstreamSuperAdmin = () => axiosAuth('superadmin', { adminMode: true, baseURL: upstreamBaseURL() })

export const upstreamAxiosAuth = (user: string, opts?: { org?: string }) =>
  axiosAuth(user, { ...opts, baseURL: upstreamBaseURL() })

export const upstreamAxiosWithApiKey = (key: string) =>
  axiosBuilder({ baseURL: upstreamBaseURL(), headers: { 'x-api-key': key } })

// The upstream also runs NODE_ENV=development, so its test-env router is mounted,
// and a request from localhost is internal.
export const cleanUpstream = async () => {
  await anonymousAx.delete(`${upstreamBaseURL()}/api/test-env`)
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npm run check-types && npm run lint-fix`
Expected: both exit 0.

- [ ] **Step 3: Verify the helpers reach a live upstream**

```bash
cd /home/alban/data-fair/registry_feat-better-sync-ui
set -a && . ./.env && set +a
node --experimental-strip-types --no-warnings=ExperimentalWarning --input-type=module -e "
import { upstreamBaseURL, upstreamSuperAdmin, cleanUpstream } from './tests/support/axios.ts'
console.log('upstream:', upstreamBaseURL())
const admin = await upstreamSuperAdmin()
const res = await admin.get('/api/v1/artefacts')
console.log('artefacts on upstream:', res.data.count)
await cleanUpstream()
console.log('cleanUpstream ok')
"
```

Expected: prints the upstream URL, an artefact count, and `cleanUpstream ok`. A connection error here means the upstream is not running — go back to the human step.

- [ ] **Step 4: Verify nothing else regressed**

Run: `npm run test-api -- tests/remote-registries.api.spec.ts`
Expected: PASS (the `axiosAuth` change must not alter existing behaviour — `axiosOpts` is still the default when `baseURL` is absent).

- [ ] **Step 5: Commit**

```bash
git add tests/support/axios.ts
git commit -m "test: axios helpers for the federation upstream registry"
```

---

### Task 3: Seed the upstream and wire the mirror in dev fixtures

**Files:**
- Modify: `dev/fixtures.ts`

**Interfaces:**
- Consumes: the Task 2 helpers.
- Produces: a dev stack where the downstream has a remote registry pointing at the upstream, with two artefacts selected and **not yet synced**.

- [ ] **Step 1: Extend the imports**

```ts
import {
  superAdmin, axiosWithApiKey, baseURL, axios as axiosFactory,
  upstreamBaseURL, upstreamSuperAdmin, upstreamAxiosAuth, upstreamAxiosWithApiKey
} from '../tests/support/axios.ts'
```

The raw read key survives a re-run under `output.keys['dev-upstream-read']`, so `OutputFile` needs no change.

- [ ] **Step 2: Add the federation section**

Insert immediately before the final `console.log(...)` in `main()`:

```ts
  // --- Federation upstream ------------------------------------------------
  // Requires the `api-upstream` process (npm run dev-api-upstream). Hard-fails
  // if it is down: the pane is part of the standard dev layout.
  const upstreamUrl = upstreamBaseURL()
  console.log(`→ Upstream registry ${upstreamUrl}`)
  try {
    await anonymousPing(upstreamUrl)
  } catch {
    throw new Error(
      `upstream registry not reachable at ${upstreamUrl} — is the \`api-upstream\` zellij pane running? (npm run dev-api-upstream)`
    )
  }

  const upstreamAdmin = await upstreamSuperAdmin()

  // Upload key on the upstream
  const upstreamKeys = await upstreamAdmin.get('/api/v1/api-keys?type=upload')
  const upstreamKeyNames = new Set<string>(upstreamKeys.data.results.map((k: any) => k.name))
  if (!upstreamKeyNames.has('dev-upstream-upload') || !output.keys['dev-upstream-upload']) {
    if (upstreamKeyNames.has('dev-upstream-upload')) {
      throw new Error('upstream upload key exists but its raw value is lost — wipe the upstream db and re-run')
    }
    const res = await upstreamAdmin.post('/api/v1/api-keys', { type: 'upload', name: 'dev-upstream-upload' })
    output.keys['dev-upstream-upload'] = res.data.key
    console.log('  + upstream api-key dev-upstream-upload')
    await saveOutput(output)
  } else {
    console.log('  ✓ upstream api-key dev-upstream-upload (skipped)')
  }
  const upstreamUpload = upstreamAxiosWithApiKey(output.keys['dev-upstream-upload'])

  const upstreamArtefactExists = async (id: string) => {
    try {
      await upstreamAdmin.get(`/api/v1/artefacts/${encodeURIComponent(id)}`)
      return true
    } catch (err) {
      if (isHttp404(err)) return false
      throw err
    }
  }

  // Ids deliberately disjoint from the local fixtures above: selecting an id that
  // already exists locally without an `origin` is rejected with 409.
  const UPSTREAM_NPM_ID = '@upstream/processing-remote@1'
  const UPSTREAM_FILE_ID = 'upstream-terrain'

  if (!await upstreamArtefactExists(UPSTREAM_NPM_ID)) {
    const tarball = await createTestTarball({ name: '@upstream/processing-remote', version: '1.0.0', licence: 'MIT' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    form.append('category', 'processing')
    await upstreamUpload.post(`/api/v1/artefacts/npm/${encodeURIComponent(UPSTREAM_NPM_ID)}`, form, { headers: form.getHeaders() })
    console.log(`  + upstream npm ${UPSTREAM_NPM_ID}`)
  } else {
    console.log(`  ✓ upstream npm ${UPSTREAM_NPM_ID} (skipped)`)
  }

  if (!await upstreamArtefactExists(UPSTREAM_FILE_ID)) {
    const form = new FormData()
    form.append('file', Buffer.from('upstream-tileset-bytes'), { filename: 'upstream-terrain.mbtiles', contentType: 'application/octet-stream' })
    form.append('category', 'tileset')
    await upstreamUpload.post(`/api/v1/artefacts/file/${encodeURIComponent(UPSTREAM_FILE_ID)}`, form, { headers: form.getHeaders() })
    console.log(`  + upstream file ${UPSTREAM_FILE_ID}`)
  } else {
    console.log(`  ✓ upstream file ${UPSTREAM_FILE_ID} (skipped)`)
  }

  // Public so any read key may download them.
  await upstreamAdmin.patch(`/api/v1/artefacts/${encodeURIComponent(UPSTREAM_NPM_ID)}`, { public: true })
  await upstreamAdmin.patch(`/api/v1/artefacts/${encodeURIComponent(UPSTREAM_FILE_ID)}`, { public: true })

  // A read key requires an access grant for its owner account, minted by an admin of it.
  try {
    await upstreamAdmin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    console.log('  + upstream access-grant organization:test1')
  } catch (err) {
    if (!isHttp409(err)) throw err
    console.log('  ✓ upstream access-grant organization:test1 (skipped)')
  }

  if (!output.keys['dev-upstream-read']) {
    const orgAdmin = await upstreamAxiosAuth('test1-admin1', { org: 'test1' })
    const res = await orgAdmin.post('/api/v1/api-keys', {
      type: 'read',
      name: 'dev-federation',
      owner: { type: 'organization', id: 'test1' }
    })
    output.keys['dev-upstream-read'] = res.data.key
    console.log('  + upstream read-key dev-federation (owner organization:test1)')
    await saveOutput(output)
  } else {
    console.log('  ✓ upstream read-key dev-federation (skipped)')
  }

  // Downstream: register the mirror and select both artefacts. Deliberately does NOT sync —
  // leave the "Sync now" button for a human to click.
  try {
    await admin.post('/api/v1/remote-registries', {
      url: upstreamUrl,
      name: 'Dev upstream',
      apiKey: output.keys['dev-upstream-read']
    })
    console.log(`  + remote-registry ${upstreamUrl}`)
  } catch (err) {
    if (!isHttp409(err)) throw err
    console.log(`  ✓ remote-registry ${upstreamUrl} (skipped)`)
  }

  for (const artefactId of [UPSTREAM_NPM_ID, UPSTREAM_FILE_ID]) {
    try {
      await admin.post(`/api/v1/remote-registries/${encodeURIComponent(upstreamUrl)}/selected-artefacts`, { artefactId })
      console.log(`  + selected ${artefactId}`)
    } catch (err) {
      if (!isHttp409(err)) throw err
      console.log(`  ✓ selected ${artefactId} (skipped)`)
    }
  }

  console.log('\n  → Sync is wired but not run. Click "Sync now" in the admin UI to exercise it.')
```

- [ ] **Step 3: Add the ping helper**

`anonymousPing` does not exist. Add it above `main()`, next to `isHttp404`. It reuses the exported `axios` factory (aliased to `axiosFactory` in the import above, since `axios` would shadow the package name):

```ts
const anonymousPing = async (url: string) => {
  await axiosFactory({ baseURL: url }).get('/api/ping')
}
```

- [ ] **Step 4: Run the fixtures**

Run: `npm run dev:fixtures`
Expected: the existing lines, then the upstream lines, then the "Sync is wired but not run" note. Exit 0.

- [ ] **Step 5: Verify idempotency**

Run: `npm run dev:fixtures`
Expected: exit 0 again, every federation line now `✓ … (skipped)`. No duplicate registries, no duplicate keys.

- [ ] **Step 6: Verify hard-fail behaviour is honest**

Do **not** stop the upstream. Instead confirm the failure message by pointing at a dead port:

```bash
cd /home/alban/data-fair/registry_feat-better-sync-ui
set -a && . ./.env && set +a
DEV_UPSTREAM_API_PORT=1 npm run dev:fixtures 2>&1 | tail -3
```

Expected: a non-zero exit and the message naming `api-upstream` / `npm run dev-api-upstream`.

- [ ] **Step 7: Verify in the UI**

Open `/registry/admin/remote-registries/<encodeURIComponent(upstream url)>`. Expect: the registry, two selected artefacts, `never synced`. Click **Sync now** and watch progress run to `success`. Then confirm the mirrored artefacts appear in the artefact list with an `origin`.

Report exactly what you observed.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint-fix && npm run check-types
git add dev/fixtures.ts
git commit -m "test(dev): seed a federation upstream and wire the mirror in fixtures"
```

---

### Task 4: The sync test

The first test anywhere to execute `syncNpmArtefact` / `syncFileArtefact`.

**Files:**
- Create: `tests/remote-registries-sync.api.spec.ts`

**Interfaces:**
- Consumes: the Task 2 helpers.
- Produces: nothing downstream.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import {
  superAdmin, clean,
  upstreamBaseURL, upstreamSuperAdmin, upstreamAxiosAuth, upstreamAxiosWithApiKey, cleanUpstream
} from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

const NPM_ID = '@up/pkg@1'
const FILE_ID = 'up-terrain'
const FILE_BYTES = 'upstream-tileset-bytes'

// Seeds the upstream registry and returns a read key owned by org test1.
// A read key needs (a) an admin of the owner account and (b) an access grant for it.
const seedUpstream = async () => {
  const admin = await upstreamSuperAdmin()
  const keyRes = await admin.post('/api/v1/api-keys', { type: 'upload', name: 'up-ci' })
  const upload = upstreamAxiosWithApiKey(keyRes.data.key)

  const tarball = await createTestTarball({ name: '@up/pkg', version: '1.0.0', licence: 'MIT' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  form.append('category', 'processing')
  await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent(NPM_ID), form, { headers: form.getHeaders() })
  await admin.patch('/api/v1/artefacts/' + encodeURIComponent(NPM_ID), { public: true })

  const fileForm = new FormData()
  fileForm.append('file', Buffer.from(FILE_BYTES), { filename: 'up.mbtiles', contentType: 'application/octet-stream' })
  fileForm.append('category', 'tileset')
  await upload.post('/api/v1/artefacts/file/' + FILE_ID, fileForm, { headers: fileForm.getHeaders() })
  await admin.patch('/api/v1/artefacts/' + FILE_ID, { public: true })

  await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
  const orgAdmin = await upstreamAxiosAuth('test1-admin1', { org: 'test1' })
  const readRes = await orgAdmin.post('/api/v1/api-keys', {
    type: 'read',
    name: 'federation',
    owner: { type: 'organization', id: 'test1' }
  })
  return { readKey: readRes.data.key as string, uploadKey: keyRes.data.key as string }
}

const registerMirror = async (readKey: string, artefactIds: string[]) => {
  const admin = await superAdmin
  await admin.post('/api/v1/remote-registries', { url: upstreamBaseURL(), name: 'Upstream', apiKey: readKey })
  for (const artefactId of artefactIds) {
    await admin.post(
      `/api/v1/remote-registries/${encodeURIComponent(upstreamBaseURL())}/selected-artefacts`,
      { artefactId }
    )
  }
}

// Triggers a sync and waits for it to settle. `previousLastSyncAt` distinguishes a fresh
// completion from the previous one — a bare `lastSyncStatus` check would return instantly
// on the second sync of a test.
const runSync = async (previousLastSyncAt?: string) => {
  const admin = await superAdmin
  const id = encodeURIComponent(upstreamBaseURL())
  await admin.post(`/api/v1/remote-registries/${id}/sync`)
  for (let i = 0; i < 100; i++) {
    const res = await admin.get(`/api/v1/remote-registries/${id}`)
    if (res.data.lastSyncStatus && res.data.lastSyncAt !== previousLastSyncAt) return res.data
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('sync did not settle within 10s')
}

const getLocal = async (id: string) => {
  const admin = await superAdmin
  const res = await admin.get('/api/v1/artefacts/' + encodeURIComponent(id))
  return res.data
}

const download = async (ax: any, id: string) => {
  const res = await ax.get('/api/v1/artefacts/' + encodeURIComponent(id) + '/download', {
    responseType: 'arraybuffer',
    maxRedirects: 0,
    validateStatus: (s: number) => s === 200 || s === 302
  })
  return Buffer.from(res.data)
}

test.describe('Federation sync against a real upstream registry', () => {
  let readKey: string
  let uploadKey: string

  test.beforeEach(async () => {
    await clean()
    await cleanUpstream()
    const seeded = await seedUpstream()
    readKey = seeded.readKey
    uploadKey = seeded.uploadKey
  })

  test('mirrors a real npm artefact end to end', async () => {
    await registerMirror(readKey, [NPM_ID])
    const registry = await runSync()

    expect(registry.lastSyncStatus).toBe('success')
    expect(registry.lastSyncError).toBeUndefined()
    expect(registry.syncProgress.total).toBe(1)
    expect(registry.syncProgress.done).toBe(1)
    expect(registry.syncState).toBe('idle')

    const local = await getLocal(NPM_ID)
    expect(local.origin).toBe(upstreamBaseURL())
    expect(local.format).toBe('npm')
    expect(local.packageName).toBe('@up/pkg')
    expect(local.version).toBe('1.0.0')
    expect(typeof local.path).toBe('string')
    expect(local.size).toBeGreaterThan(0)
    expect(local.hasNativeModules).toBe(false)
  })

  test('the mirrored tarball is byte-identical to the upstream one', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()

    const upstreamAdmin = await upstreamSuperAdmin()
    const downstreamAdmin = await superAdmin
    const upstreamBytes = await download(upstreamAdmin, NPM_ID)
    const localBytes = await download(downstreamAdmin, NPM_ID)

    expect(localBytes.length).toBe(upstreamBytes.length)
    expect(localBytes.equals(upstreamBytes)).toBe(true)
  })

  test('a re-sync with no upstream change does not re-download', async () => {
    await registerMirror(readKey, [NPM_ID])
    const first = await runSync()
    const before = await getLocal(NPM_ID)

    await runSync(first.lastSyncAt)
    const after = await getLocal(NPM_ID)

    // the dataUpdatedAt fast path in syncNpmArtefact short-circuits
    expect(after.dataUpdatedAt).toBe(before.dataUpdatedAt)
    expect(after.path).toBe(before.path)
  })

  test('an upstream republish is picked up on the next sync', async () => {
    await registerMirror(readKey, [NPM_ID])
    const first = await runSync()
    const before = await getLocal(NPM_ID)

    const upload = upstreamAxiosWithApiKey(uploadKey)
    const tarball = await createTestTarball({ name: '@up/pkg', version: '2.0.0', licence: 'MIT' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    form.append('category', 'processing')
    await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent(NPM_ID), form, { headers: form.getHeaders() })

    await runSync(first.lastSyncAt)
    const after = await getLocal(NPM_ID)

    expect(after.version).toBe('2.0.0')
    expect(after.path).not.toBe(before.path)
    expect(after.dataUpdatedAt).not.toBe(before.dataUpdatedAt)
  })

  test('a file artefact mirrors too, with its bytes', async () => {
    await registerMirror(readKey, [FILE_ID])
    const registry = await runSync()
    expect(registry.lastSyncStatus).toBe('success')

    const local = await getLocal(FILE_ID)
    expect(local.origin).toBe(upstreamBaseURL())
    expect(local.format).toBe('file')

    const admin = await superAdmin
    const bytes = await download(admin, FILE_ID)
    expect(bytes.toString()).toBe(FILE_BYTES)
  })

  test('a genuinely mirrored artefact rejects remote-owned edits but allows local access edits', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()
    const admin = await superAdmin
    const id = encodeURIComponent(NPM_ID)

    try {
      await admin.patch('/api/v1/artefacts/' + id, { title: { en: 'nope' } })
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(403)
    }

    try {
      await admin.delete('/api/v1/artefacts/' + id)
      expect(true).toBe(false)
    } catch (err: any) {
      expect(err.status).toBe(403)
    }

    const res = await admin.patch('/api/v1/artefacts/' + id, { public: true })
    expect(res.data.public).toBe(true)
  })

  test('unselecting a mirrored artefact clears its origin', async () => {
    await registerMirror(readKey, [NPM_ID])
    await runSync()
    const admin = await superAdmin

    await admin.delete(
      `/api/v1/remote-registries/${encodeURIComponent(upstreamBaseURL())}/selected-artefacts/${encodeURIComponent(NPM_ID)}`
    )

    const local = await getLocal(NPM_ID)
    expect(local.origin).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the spec**

Run: `npm run test-api -- tests/remote-registries-sync.api.spec.ts`
Expected: 7 passed, output pristine.

- [ ] **Step 3: Prove the tests actually fail when the mirror breaks**

A test that cannot fail is worse than no test. **Temporarily** break the download in `api/src/remote-registries/sync.ts` — in `syncNpmArtefact`, comment out the `filesStorage.writeStream(dlRes.data, localPath)` line — then re-run:

Run: `npm run test-api -- tests/remote-registries-sync.api.spec.ts -g "byte-identical"`
Expected: FAIL.

Restore the line, re-run, confirm PASS. Report both outputs. **Do not commit the broken version.**

- [ ] **Step 4: Verify the whole api project still passes**

Run: `npm run test-api`
Expected: all pass, including the pre-existing `remote-registries.api.spec.ts`.

Watch for cross-test interference: this spec's `beforeEach` calls `clean()` **and** `cleanUpstream()`, and the api project runs with `workers: 1`, so specs do not overlap.

- [ ] **Step 5: Lint, type-check, commit**

```bash
npm run lint-fix && npm run check-types
git add tests/remote-registries-sync.api.spec.ts
git commit -m "test: mirror a real artefact from a real upstream registry"
```

---

### Task 5: CI and docs

**Files:**
- Modify: `.github/workflows/reuse-quality.yml`, `AGENTS.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing downstream.

- [ ] **Step 1: Start the upstream in CI and wait for both APIs**

In `.github/workflows/reuse-quality.yml`, replace the "Start dev API" step and add two more. The existing step has no readiness wait — it races and gets away with it; adding a second process makes that worse, so wait for both:

```yaml
    - name: Start dev API
      run: |
        set -a && . ./.env && set +a
        NODE_ENV=development NODE_CONFIG_DIR=$PWD/api/config/ node api/index.ts &

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
          timeout 60 bash -c "until curl -sf http://localhost:$p/api/ping >/dev/null; do sleep 1; done"
          echo "api on :$p is up"
        done

    - name: Run tests
      run: npm run test-unit && npm run test-api
```

CI runs `bash dev/init-env.sh` earlier, so `DEV_UPSTREAM_API_PORT` exists there once Task 1 landed. Both processes run from the repo root, so their `DATA_DIR`s resolve to `./data` and `./data-upstream` there.

- [ ] **Step 2: Document it in `AGENTS.md`**

In the "Dev environment" section, after the `dev/status.sh` line:

```markdown
Four dev processes run under zellij: `api` (the registry, port `DEV_API_PORT`), `api-upstream` (a second registry used as a federation mirror source, port `DEV_UPSTREAM_API_PORT`), `ui`, and `deps` (docker compose).

Log files are in `dev/logs/` (dev-api.log, dev-api-upstream.log, dev-ui.log, docker-compose.log).
```

And in "Testing", after the test-user note:

```markdown
### Exercising federation sync

Sync mirrors artefacts *from* an upstream registry, so it needs two registries. `api-upstream` is a second registry process (same code, `PORT`/`MONGO_URL`/`DATA_DIR` overridden) — pointing a registry at itself cannot work, because selecting an artefact that already exists locally without an `origin` returns 409.

`npm run dev:fixtures` seeds the upstream, mints a read key owned by org `test1`, registers the mirror and selects two artefacts. It stops short of syncing — click **Sync now** in the admin UI.

`tests/remote-registries-sync.api.spec.ts` covers the mirror path end to end against the same upstream.
```

Fix the existing log-files line if it lists only three logs.

- [ ] **Step 3: Verify the workflow is valid YAML**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/reuse-quality.yml')); print('valid yaml')"
```

Expected: `valid yaml`.

- [ ] **Step 4: Full quality gate**

Run: `npm run quality`
Expected: exits 0. Do not claim completion on a partial run — paste the failing output if anything trips.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/reuse-quality.yml AGENTS.md
git commit -m "ci: run a federation upstream registry alongside the api tests"
```

---

## Self-review notes

**Spec coverage.** Second real registry process → Task 1. Env/ports/gitignore/zellij/status → Task 1. Test-support helpers + `axiosAuth` `baseURL` option → Task 2. Fixtures (hard-fail, idempotent, no auto-sync) → Task 3. The seven test assertions → Task 4. CI + readiness wait + docs → Task 5. "No api code changes" → honoured; the only `api/src` edit is a *temporary, reverted* mutation in Task 4 Step 3.

**Type consistency.** `upstreamBaseURL` is a **function** everywhere it is used (`upstreamBaseURL()`), because a module-level throw would break every spec importing `tests/support/axios.ts` when `DEV_UPSTREAM_API_PORT` is absent. `upstreamSuperAdmin()` is likewise a function returning a promise, unlike the existing `superAdmin` which is a promise — the two are not interchangeable, and Task 4 uses `await upstreamSuperAdmin()`.

**Known non-obvious risks.**
- `dev/status.sh` runs under `set -euo pipefail`; an unguarded `${DEV_UPSTREAM_API_PORT}` would abort the whole script for anyone whose `.env` predates Task 1. Step 7 guards it.
- Two nodemon processes watch the same `api/` tree; both restart on a source change. That is intended and harmless.
- The upstream runs its own 24h `syncAllRemoteRegistries` timer. It has no remotes, so it does nothing.
- `createTestTarball` is imported by `dev/fixtures.ts` already; Task 3 reuses it rather than adding a fixture tarball on disk.
