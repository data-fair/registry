# Federation Sync Observable State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make remote-registry sync observable — the UI knows when a sync is running, how far it has got, and refuses a second click, without polling.

**Architecture:** Three mechanisms, one job each. The Mongo `locks` collection answers *is it running* (cross-replica, self-healing via its 60s TTL). A `syncProgress` field on the registry doc answers *how far did it get* (survives the process, renders on page load). A WebSocket channel answers *what just changed* (push, no polling). `syncState` (`running` / `interrupted` / `idle`) is derived from the first two, never stored.

**Tech Stack:** Express + MongoDB (api), Vue 3 + Vuetify (ui), `@data-fair/lib-node/locks.js`, `@data-fair/lib-node/ws-emitter.js`, `@data-fair/lib-express/ws-server.js`, `useWS` from `@data-fair/lib-vue`, Playwright test runner.

**Spec:** `docs/superpowers/specs/2026-07-09-federation-sync-ui-design.md`

## Global Constraints

- Types are generated from JSON schemas. After editing `api/types/remote-registry/schema.js` you MUST run `npm run build-types`. Never hand-edit `api/types/remote-registry/.type/*`.
- After `build-types`, the running dev API may still execute stale generated code. Touch `api/index.ts` to force a nodemon reload.
- Never start, stop, or restart dev processes. Check them with `bash dev/status.sh`. Logs are in `dev/logs/`.
- Quality gates: `npm run lint-fix`, `npm run check-types`, `npm run test`. All three via `npm run quality`.
- Run a single test file with `npm run test tests/<file>.spec.ts`.
- Test projects are matched by filename: `*.unit.spec.ts`, `*.api.spec.ts`, `*.e2e.spec.ts`.
- `syncState` is **never persisted**. It is computed on read from the lock plus `syncProgress`/`lastSyncAt`.
- The registry `_id` **is a URL**. Every channel name, lock id, and route param built from it must be `encodeURIComponent`-ed at the boundary that needs it.
- No upgrade script. `syncProgress` is absent on existing docs and every derivation treats absent as "no attempt recorded".

## Deviation from the spec

The spec's testing section says the emit call site is "unit-asserted (once per artefact, right channel)". Counting emits requires injecting the emitter into `runSync` — dependency injection added purely for a test, on a function whose real behaviour is already covered by the `syncProgress` assertions in Task 6. **This plan unit-tests `syncChannel()`'s encoding instead** (the part that can actually go wrong) and does not assert emit counts. Everything else follows the spec.

## File Structure

| File | Responsibility |
|---|---|
| `api/src/remote-registries/operations.ts` | **Modify.** Add pure helpers: `syncLockId`, `syncChannel`, `syncState`. No I/O. |
| `api/types/remote-registry/schema.js` | **Modify.** Add the `syncProgress` object. |
| `api/src/server.ts` | **Modify.** Boot `wsEmitter` + `wsServer`; stop `wsServer`. |
| `api/src/remote-registries/sync.ts` | **Modify.** Split `syncRemoteRegistry` into `runSync` (progress + emit), `syncRemoteRegistry` (awaits, for the daily job), `startSync` (returns on lock acquisition, for the route). |
| `api/src/remote-registries/router.ts` | **Modify.** Enrich reads with `syncState`; `409` on a held lock. |
| `api/src/app.ts` | **Modify.** Dev-only `test-env` lock endpoints; `clean()` drops `locks`. |
| `tests/support/axios.ts` | **Modify.** `holdSyncLock` / `releaseSyncLock` helpers. |
| `tests/remote-registries-operations.unit.spec.ts` | **Modify.** Cover `syncState` and `syncChannel`. |
| `tests/remote-registries.api.spec.ts` | **Modify.** Cover `syncState` on reads, `409`, and progress persistence. |
| `ui/src/composables/registry-sync.ts` | **Create.** Owns the socket subscription; folds events into the registry ref. |
| `ui/src/pages/admin/remote-registries/[id].vue` | **Modify.** Live progress, three states, disabled button, `409` handling. |
| `ui/src/components/admin/remote-registries-section.vue` | **Modify.** `syncState` chip per row. |

---

### Task 1: Pure sync-state helpers

The whole derivation lives here so it has one home, is trivially testable, and both the router and the sync module import it rather than re-deriving.

**Files:**
- Modify: `api/src/remote-registries/operations.ts`
- Test: `tests/remote-registries-operations.unit.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SyncState = 'running' | 'interrupted' | 'idle'`
  - `syncLockId(registryId: string): string`
  - `syncChannel(registryId: string): string`
  - `syncState(locked: boolean, registry: { syncProgress?: { startedAt: string }, lastSyncAt?: string }): SyncState`

- [ ] **Step 1: Write the failing tests**

Append to `tests/remote-registries-operations.unit.spec.ts`:

```ts
import { filterSuggestedArtefacts, syncLockId, syncChannel, syncState } from '../api/src/remote-registries/operations.ts'

test.describe('syncLockId', () => {
  test('namespaces the registry url', () => {
    expect(syncLockId('https://up.example.com/registry')).toBe('sync-remote-https://up.example.com/registry')
  })
})

test.describe('syncChannel', () => {
  test('encodes the registry url so slashes do not split the channel', () => {
    expect(syncChannel('https://up.example.com/registry'))
      .toBe('remote-registries/https%3A%2F%2Fup.example.com%2Fregistry/sync')
  })

  test('the encoded channel has exactly three segments', () => {
    expect(syncChannel('https://up.example.com/registry').split('/')).toHaveLength(3)
  })
})

test.describe('syncState', () => {
  test('a held lock means running, whatever the doc says', () => {
    expect(syncState(true, {})).toBe('running')
    expect(syncState(true, { syncProgress: { startedAt: '2026-07-09T10:00:00.000Z' }, lastSyncAt: '2026-07-09T11:00:00.000Z' })).toBe('running')
  })

  test('no progress recorded means idle', () => {
    expect(syncState(false, {})).toBe('idle')
    expect(syncState(false, { lastSyncAt: '2026-07-09T11:00:00.000Z' })).toBe('idle')
  })

  test('an attempt that finished is idle', () => {
    expect(syncState(false, {
      syncProgress: { startedAt: '2026-07-09T10:00:00.000Z' },
      lastSyncAt: '2026-07-09T10:00:05.000Z'
    })).toBe('idle')
  })

  test('an attempt stranded ahead of the last completed sync is interrupted', () => {
    expect(syncState(false, {
      syncProgress: { startedAt: '2026-07-09T12:00:00.000Z' },
      lastSyncAt: '2026-07-09T10:00:05.000Z'
    })).toBe('interrupted')
  })

  test('a first-ever attempt that never finished is interrupted', () => {
    expect(syncState(false, { syncProgress: { startedAt: '2026-07-09T12:00:00.000Z' } })).toBe('interrupted')
  })
})
```

Note the import line **replaces** the existing `import { filterSuggestedArtefacts } ...` line at the top of the file. Leave the existing `filterSuggestedArtefacts` describe block untouched.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test tests/remote-registries-operations.unit.spec.ts`
Expected: FAIL — `syncLockId is not a function` (or a TypeScript "has no exported member" error).

- [ ] **Step 3: Write the implementation**

Append to `api/src/remote-registries/operations.ts`:

```ts
export type SyncState = 'running' | 'interrupted' | 'idle'

// The lock row id in the shared `locks` collection. Holding it means a sync is in flight.
export const syncLockId = (registryId: string) => `sync-remote-${registryId}`

// The ws channel a registry's sync progress is published on. The registry id IS a url,
// so it must be encoded — a raw `/` would shred this `/`-delimited channel name.
export const syncChannel = (registryId: string) =>
  `remote-registries/${encodeURIComponent(registryId)}/sync`

// Running state is derived, never stored: a stored `running` flag becomes a lie the moment
// a process is killed. `interrupted` means the final write that sets lastSyncAt never
// happened, stranding the attempt's startedAt ahead of it.
export const syncState = (
  locked: boolean,
  registry: { syncProgress?: { startedAt: string }, lastSyncAt?: string }
): SyncState => {
  if (locked) return 'running'
  const startedAt = registry.syncProgress?.startedAt
  if (startedAt && (!registry.lastSyncAt || startedAt > registry.lastSyncAt)) return 'interrupted'
  return 'idle'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test tests/remote-registries-operations.unit.spec.ts`
Expected: PASS — 9 tests (3 pre-existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add api/src/remote-registries/operations.ts tests/remote-registries-operations.unit.spec.ts
git commit -m "feat(api): pure sync-state derivation helpers"
```

---

### Task 2: `syncProgress` on the registry schema

**Files:**
- Modify: `api/types/remote-registry/schema.js`
- Regenerates: `api/types/remote-registry/.type/index.d.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `RemoteRegistry['syncProgress']?: { startedAt: string, done: number, total: number, currentArtefact?: string }`

- [ ] **Step 1: Add the field to the schema**

In `api/types/remote-registry/schema.js`, insert after the `lastSyncError` property and before `createdAt`:

```js
    lastSyncError: { type: 'string' },
    syncProgress: {
      type: 'object',
      additionalProperties: false,
      required: ['startedAt', 'done', 'total'],
      properties: {
        startedAt: { type: 'string', format: 'date-time' },
        done: { type: 'integer' },
        total: { type: 'integer' },
        currentArtefact: { type: 'string' }
      }
    },
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
```

Do **not** add `syncProgress` to the root `required` array — it is absent on every existing doc.

- [ ] **Step 2: Regenerate types**

Run: `npm run build-types`
Expected: exits 0.

- [ ] **Step 3: Verify the generated type carries the field**

Run: `grep -A6 'syncProgress' api/types/remote-registry/.type/index.d.ts`
Expected: shows `syncProgress?:` with `startedAt`, `done`, `total`, `currentArtefact`.

- [ ] **Step 4: Force the dev API to reload the generated code**

Run: `touch api/index.ts`

This is not optional — nodemon can otherwise keep executing the pre-generation module.

- [ ] **Step 5: Type-check**

Run: `npm run check-types`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add api/types/remote-registry/
git commit -m "feat(api): add syncProgress to the remote-registry schema"
```

---

### Task 3: Boot the websocket server

No behaviour is observable yet — this task's deliverable is that the socket accepts an authenticated admin connection and nothing regresses. It is separated from Task 6 because a reviewer could reasonably reject the boot wiring while approving the emit call sites.

**Files:**
- Modify: `api/src/server.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a live `WebSocketServer` on the API's http server; `wsEmitter.emit(channel, data)` becomes usable process-wide.

- [ ] **Step 1: Add the imports**

In `api/src/server.ts`, after the existing `import locks from '@data-fair/lib-node/locks.js'`:

```ts
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import * as wsServer from '@data-fair/lib-express/ws-server.js'
```

- [ ] **Step 2: Start them**

In `start()`, immediately after `await locks.start(mongo.db)`:

```ts
  await locks.start(mongo.db)
  await wsEmitter.init(mongo.db)
  // `canSubscribe` is never reached for admins: ws-server short-circuits on
  // sessionState.user?.adminMode before calling it. Remote-registry sync is an
  // admin-only surface, so returning false refuses precisely everyone else.
  await wsServer.start(server, mongo.db, async () => false)
```

- [ ] **Step 3: Stop it**

In `stop()`, between `httpTerminator.terminate()` and `locks.stop()`:

```ts
  await httpTerminator.terminate()
  await wsServer.stop()
  if (config.observer?.active) await stopObserver()
  await locks.stop()
```

- [ ] **Step 4: Verify no regression and that the socket is up**

Run: `npm run check-types && npm run test tests/ping.api.spec.ts`
Expected: both exit 0.

Then confirm the server upgraded a websocket rather than 404ing it:

```bash
set -a && . ./.env && set +a
curl -s -o /dev/null -w '%{http_code}' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "http://localhost:${DEV_API_PORT}/api/"
```
Expected: `101`. A `404` or `426` means `wsServer.start` did not attach to the http server. (`wsServer` attaches to the whole http server, not a path, so any path upgrades — `/api/` is just convenient.)

- [ ] **Step 5: Commit**

```bash
git add api/src/server.ts
git commit -m "feat(api): boot the ws pub/sub server and emitter"
```

---

### Task 4: Reads expose `syncState`

The dev-only lock endpoints are folded in here because this task's tests are the first thing that needs them: a real sync finishes far too fast to observe `running` by racing it. We hold the lock directly instead.

**Files:**
- Modify: `api/src/app.ts` (dev-only `test-env` routes; `clean()` drops `locks`)
- Modify: `api/src/remote-registries/router.ts`
- Modify: `tests/support/axios.ts`
- Test: `tests/remote-registries.api.spec.ts`

**Interfaces:**
- Consumes: `syncLockId`, `syncState` (Task 1).
- Produces:
  - `GET /api/v1/remote-registries` → each result carries `syncState: SyncState`
  - `GET /api/v1/remote-registries/:id` → carries `syncState: SyncState`
  - `holdSyncLock(registryId: string): Promise<void>` and `releaseSyncLock(registryId: string): Promise<void>` in `tests/support/axios.ts`

- [ ] **Step 1: Add the dev-only lock endpoints**

In `api/src/app.ts`, inside the existing `if (process.env.NODE_ENV === 'development') {` block, add the `locks` wipe to the existing `DELETE /api/test-env` handler (after `await mongo.remoteRegistries.deleteMany({})`):

```ts
    await mongo.remoteRegistries.deleteMany({})
    await mongo.db.collection('locks').deleteMany({})
```

Then add two new routes inside the same block, after the existing `PUT /api/test-env/artefacts/:id/origin` handler:

```ts
  // Hold a lock under a FOREIGN pid so the API process can neither release nor prolong it.
  // Lets a test observe `running` deterministically instead of racing a real sync.
  // The row still expires on its own via the locks TTL index if a test forgets to clean up.
  app.put('/api/test-env/locks/:id', async (req, res) => {
    assertReqInternal(req)
    const now = new Date()
    await mongo.db.collection('locks').insertOne({
      _id: req.params.id as any,
      pid: 'test-env',
      hostname: 'test-env',
      createdAt: now,
      updatedAt: now
    })
    res.send()
  })

  app.delete('/api/test-env/locks/:id', async (req, res) => {
    assertReqInternal(req)
    await mongo.db.collection('locks').deleteOne({ _id: req.params.id as any })
    res.send()
  })
```

- [ ] **Step 2: Add the test helpers**

Append to `tests/support/axios.ts`:

```ts
const testEnvUrl = `http://localhost:${process.env.DEV_API_PORT}/api/test-env`

// The lock id embeds the registry url, so it must be encoded as a single path segment.
const syncLockPath = (registryId: string) => `${testEnvUrl}/locks/${encodeURIComponent('sync-remote-' + registryId)}`

export const holdSyncLock = async (registryId: string) => {
  await anonymousAx.put(syncLockPath(registryId), {})
}

export const releaseSyncLock = async (registryId: string) => {
  await anonymousAx.delete(syncLockPath(registryId))
}
```

- [ ] **Step 3: Write the failing tests**

Append a new describe block to `tests/remote-registries.api.spec.ts`, and add `holdSyncLock, releaseSyncLock` to the existing import from `./support/axios.ts`:

```ts
  test.describe('Sync state on reads', () => {
    const url = 'https://upstream.example.com'

    test.beforeEach(async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', { url, name: 'Upstream', apiKey: 'reg_abc_secretkey123' })
    })

    test('a registry with no attempt recorded is idle', async () => {
      const ax = await superAdmin
      const res = await ax.get('/api/v1/remote-registries/' + encodeURIComponent(url))
      expect(res.data.syncState).toBe('idle')
    })

    test('a held lock reports running on the detail endpoint', async () => {
      const ax = await superAdmin
      await holdSyncLock(url)
      try {
        const res = await ax.get('/api/v1/remote-registries/' + encodeURIComponent(url))
        expect(res.data.syncState).toBe('running')
      } finally {
        await releaseSyncLock(url)
      }
      const after = await ax.get('/api/v1/remote-registries/' + encodeURIComponent(url))
      expect(after.data.syncState).toBe('idle')
    })

    test('a held lock reports running on the list endpoint', async () => {
      const ax = await superAdmin
      await holdSyncLock(url)
      try {
        const res = await ax.get('/api/v1/remote-registries')
        expect(res.data.results.find((r: any) => r._id === url).syncState).toBe('running')
      } finally {
        await releaseSyncLock(url)
      }
    })

    test('one registry running does not mark its siblings as running', async () => {
      const ax = await superAdmin
      const other = 'https://other.example.com'
      await ax.post('/api/v1/remote-registries', { url: other, name: 'Other', apiKey: 'reg_def_otherkey' })
      await holdSyncLock(url)
      try {
        const res = await ax.get('/api/v1/remote-registries')
        const byId = Object.fromEntries(res.data.results.map((r: any) => [r._id, r.syncState]))
        expect(byId[url]).toBe('running')
        expect(byId[other]).toBe('idle')
      } finally {
        await releaseSyncLock(url)
      }
    })
  })
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test tests/remote-registries.api.spec.ts`
Expected: FAIL — `expected 'idle', received undefined` (the field does not exist yet).

- [ ] **Step 5: Enrich the read endpoints**

In `api/src/remote-registries/router.ts`, extend the existing import from `./operations.ts`:

```ts
import { filterSuggestedArtefacts, syncLockId, syncState } from './operations.ts'
```

Add this helper below `extractShortId`:

```ts
// One query for the whole page, not one per row.
const lockedLockIds = async (registryIds: string[]): Promise<Set<string>> => {
  if (registryIds.length === 0) return new Set()
  const rows = await mongo.db.collection('locks')
    .find({ _id: { $in: registryIds.map(syncLockId) as any } }, { projection: { _id: 1 } })
    .toArray()
  return new Set(rows.map(row => String(row._id)))
}
```

Replace the body of `GET /`:

```ts
router.get('/', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const results = await mongo.remoteRegistries.find({}, { projection: { apiKey: 0 } }).toArray()
    const locked = await lockedLockIds(results.map(r => r._id))
    res.json({
      results: results.map(r => ({ ...r, syncState: syncState(locked.has(syncLockId(r._id)), r) })),
      count: results.length
    })
  } catch (err) { next(err) }
})
```

Replace the body of `GET /:id`:

```ts
router.get('/:id', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id }, { projection: { apiKey: 0 } })
    if (!doc) throw httpError(404, 'remote registry not found')
    const locked = await lockedLockIds([doc._id])
    res.json({ ...doc, syncState: syncState(locked.has(syncLockId(doc._id)), doc) })
  } catch (err) { next(err) }
})
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test tests/remote-registries.api.spec.ts`
Expected: PASS — all pre-existing tests plus the 4 new ones.

- [ ] **Step 7: Commit**

```bash
git add api/src/app.ts api/src/remote-registries/router.ts tests/support/axios.ts tests/remote-registries.api.spec.ts
git commit -m "feat(api): expose derived syncState on remote-registry reads"
```

---

### Task 5: `409` on a concurrent manual sync

**Files:**
- Modify: `api/src/remote-registries/sync.ts`
- Modify: `api/src/remote-registries/router.ts:188-199`
- Test: `tests/remote-registries.api.spec.ts`

**Interfaces:**
- Consumes: `syncLockId` (Task 1); `holdSyncLock`/`releaseSyncLock` (Task 4).
- Produces:
  - `startSync(registryId: string): Promise<boolean>` — returns as soon as the lock is taken; `false` if already held.
  - `syncRemoteRegistry(registryId: string): Promise<boolean>` — awaits completion; `false` if already held. Used by the daily job.
  - `runSync(registryId: string): Promise<void>` — module-private, the actual work.

- [ ] **Step 1: Write the failing tests**

Append to the `Sync state on reads` describe block's parent (a new describe block) in `tests/remote-registries.api.spec.ts`:

```ts
  test.describe('Manual sync trigger', () => {
    const url = 'https://upstream.example.com'

    test.beforeEach(async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries', { url, name: 'Upstream', apiKey: 'reg_abc_secretkey123' })
    })

    test('a free lock accepts the sync with 202', async () => {
      const ax = await superAdmin
      const res = await ax.post('/api/v1/remote-registries/' + encodeURIComponent(url) + '/sync')
      expect(res.status).toBe(202)
    })

    test('a held lock rejects the sync with 409', async () => {
      const ax = await superAdmin
      await holdSyncLock(url)
      try {
        await ax.post('/api/v1/remote-registries/' + encodeURIComponent(url) + '/sync')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(409)
      } finally {
        await releaseSyncLock(url)
      }
    })

    test('an unknown registry is still 404, not 409', async () => {
      const ax = await superAdmin
      try {
        await ax.post('/api/v1/remote-registries/' + encodeURIComponent('https://nope.example.com') + '/sync')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test tests/remote-registries.api.spec.ts -g "held lock rejects"`
Expected: FAIL — the request returns `202`, so `expect(true).toBe(false)` trips.

- [ ] **Step 3: Split the sync entry points**

In `api/src/remote-registries/sync.ts`, add the imports:

```ts
import { internalError } from '@data-fair/lib-node/observer.js'
import { syncLockId } from './operations.ts'
```

Rename the existing exported `syncRemoteRegistry` to a private `runSync` and strip its locking. It becomes exactly the old body **minus** the `locks.acquire` guard and the `try`/`finally` release — the lock is now the caller's responsibility:

```ts
// The actual work. Callers own the lock.
const runSync = async (remoteRegistryId: string) => {
  const remote = await mongo.remoteRegistries.findOne({ _id: remoteRegistryId })
  if (!remote) return

  const apiKey = decipher(remote.apiKey)
  const ax = axiosBuilder({
    baseURL: remote._id,
    headers: { 'x-api-key': apiKey }
  })

  let hasErrors = false
  let lastError = ''

  for (const artefactId of remote.selectedArtefacts) {
    try {
      const encodedId = encodeURIComponent(artefactId)
      const detailRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
      const format: Artefact['format'] = detailRes.data.format

      if (format === 'npm') {
        await syncNpmArtefact(ax, remote._id, artefactId)
      } else {
        await syncFileArtefact(ax, remote._id, artefactId)
      }
    } catch (err: any) {
      hasErrors = true
      lastError = `${artefactId}: ${err.message || err}`
      console.error(`[sync] Error syncing ${artefactId} from ${remote._id}:`, err.message || err)
    }
  }

  await mongo.remoteRegistries.updateOne(
    { _id: remoteRegistryId },
    {
      $set: {
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: hasErrors ? 'error' : 'success',
        ...(hasErrors ? { lastSyncError: lastError } : {})
      },
      ...(!hasErrors ? { $unset: { lastSyncError: '' } } : {})
    }
  )
}

// Returns as soon as the lock is taken; the work continues in the background.
// A held lock is a conflict the caller (a human clicking a button) should see.
export const startSync = async (remoteRegistryId: string): Promise<boolean> => {
  const lockId = syncLockId(remoteRegistryId)
  if (!await locks.acquire(lockId)) return false
  runSync(remoteRegistryId)
    .catch(err => internalError('sync-remote-registry', err))
    .finally(() => locks.release(lockId))
  return true
}

// Awaits completion. Used by the daily job, which syncs registries one at a time.
export const syncRemoteRegistry = async (remoteRegistryId: string): Promise<boolean> => {
  const lockId = syncLockId(remoteRegistryId)
  if (!await locks.acquire(lockId)) return false
  try {
    await runSync(remoteRegistryId)
  } finally {
    await locks.release(lockId)
  }
  return true
}

export const syncAllRemoteRegistries = async () => {
  const remotes = await mongo.remoteRegistries.find({}).toArray()
  for (const remote of remotes) {
    // A held lock means a peer replica is already syncing this registry. That is the
    // normal outcome of N replicas firing the same daily timer — not an error.
    await syncRemoteRegistry(remote._id).catch(err => {
      console.error(`[sync] Failed to sync ${remote._id}:`, err.message || err)
    })
  }
}
```

Note the old `console.log('[sync] Lock already held...')` line disappears: the boolean return replaces it.

- [ ] **Step 4: Make the route honour the lock**

In `api/src/remote-registries/router.ts`, change the import `import { syncRemoteRegistry } from './sync.ts'` to `import { startSync } from './sync.ts'`, and replace the `POST /:id/sync` handler body:

```ts
router.post('/:id/sync', async (req, res, next) => {
  try {
    await session.reqAdminMode(req)
    const doc = await mongo.remoteRegistries.findOne({ _id: req.params.id })
    if (!doc) throw httpError(404, 'remote registry not found')

    if (!await startSync(req.params.id)) throw httpError(409, 'sync already running')
    res.status(202).json({ message: 'sync started' })
  } catch (err) { next(err) }
})
```

The 404 lookup stays **before** the lock attempt, so an unknown registry never acquires a lock it would then have to release.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test tests/remote-registries.api.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/remote-registries/sync.ts api/src/remote-registries/router.ts tests/remote-registries.api.spec.ts
git commit -m "feat(api): reject a concurrent manual sync with 409"
```

---

### Task 6: Persist and publish sync progress

**Files:**
- Modify: `api/src/remote-registries/sync.ts`
- Test: `tests/remote-registries.api.spec.ts`

**Interfaces:**
- Consumes: `syncChannel` (Task 1); `syncProgress` type (Task 2); `wsEmitter.init` (Task 3); `runSync` (Task 5).
- Produces: `syncProgress` written on the doc at start, per artefact, and at the end; a `SyncEvent` published on `syncChannel(id)` at each of those points.

- [ ] **Step 1: Write the failing test**

Append to the `Manual sync trigger` describe block in `tests/remote-registries.api.spec.ts`:

```ts
    test('a sync over zero selected artefacts records progress and succeeds', async () => {
      const ax = await superAdmin
      await ax.post('/api/v1/remote-registries/' + encodeURIComponent(url) + '/sync')

      // the sync runs in the background; poll the doc until it settles (test-only wait)
      let doc: any
      for (let i = 0; i < 50; i++) {
        const res = await ax.get('/api/v1/remote-registries/' + encodeURIComponent(url))
        doc = res.data
        if (doc.lastSyncStatus) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      expect(doc.lastSyncStatus).toBe('success')
      expect(doc.syncProgress.total).toBe(0)
      expect(doc.syncProgress.done).toBe(0)
      expect(doc.syncProgress.currentArtefact).toBeUndefined()
      expect(doc.syncProgress.startedAt <= doc.lastSyncAt).toBe(true)
      expect(doc.syncState).toBe('idle')
    })
```

The poll loop here is a *test* waiting on a background job, not the production polling we removed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test tests/remote-registries.api.spec.ts -g "zero selected artefacts"`
Expected: FAIL — `Cannot read properties of undefined (reading 'total')`; `syncProgress` is never written.

- [ ] **Step 3: Add the emitter and progress writes**

In `api/src/remote-registries/sync.ts`, add the import and the event type:

```ts
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import { syncLockId, syncChannel } from './operations.ts'

export type SyncEvent = {
  running: boolean
  startedAt: string
  done: number
  total: number
  currentArtefact?: string
  lastSyncAt?: string
  lastSyncStatus?: 'success' | 'error'
  lastSyncError?: string
}

// A dropped progress frame is cosmetic — the next frame supersedes it — so an emit
// failure must never abort a sync.
const emitSync = async (remoteRegistryId: string, event: SyncEvent) => {
  try {
    await wsEmitter.emit(syncChannel(remoteRegistryId), event)
  } catch (err) {
    internalError('sync-ws-emit', err)
  }
}
```

Then rewrite `runSync` to bracket the loop with progress writes:

```ts
const runSync = async (remoteRegistryId: string) => {
  const remote = await mongo.remoteRegistries.findOne({ _id: remoteRegistryId })
  if (!remote) return

  const startedAt = new Date().toISOString()
  const total = remote.selectedArtefacts.length
  let done = 0

  await mongo.remoteRegistries.updateOne(
    { _id: remoteRegistryId },
    { $set: { syncProgress: { startedAt, done, total } } }
  )
  await emitSync(remoteRegistryId, { running: true, startedAt, done, total })

  const apiKey = decipher(remote.apiKey)
  const ax = axiosBuilder({
    baseURL: remote._id,
    headers: { 'x-api-key': apiKey }
  })

  let hasErrors = false
  let lastError = ''

  for (const artefactId of remote.selectedArtefacts) {
    await mongo.remoteRegistries.updateOne(
      { _id: remoteRegistryId },
      { $set: { 'syncProgress.currentArtefact': artefactId } }
    )
    await emitSync(remoteRegistryId, { running: true, startedAt, done, total, currentArtefact: artefactId })

    try {
      const encodedId = encodeURIComponent(artefactId)
      const detailRes = await ax.get(`/api/v1/artefacts/${encodedId}`)
      const format: Artefact['format'] = detailRes.data.format

      if (format === 'npm') {
        await syncNpmArtefact(ax, remote._id, artefactId)
      } else {
        await syncFileArtefact(ax, remote._id, artefactId)
      }
    } catch (err: any) {
      hasErrors = true
      lastError = `${artefactId}: ${err.message || err}`
      console.error(`[sync] Error syncing ${artefactId} from ${remote._id}:`, err.message || err)
    }

    done++
    await mongo.remoteRegistries.updateOne(
      { _id: remoteRegistryId },
      { $set: { 'syncProgress.done': done } }
    )
    await emitSync(remoteRegistryId, { running: true, startedAt, done, total, currentArtefact: artefactId })
  }

  const lastSyncAt = new Date().toISOString()
  const lastSyncStatus = hasErrors ? 'error' as const : 'success' as const

  await mongo.remoteRegistries.updateOne(
    { _id: remoteRegistryId },
    {
      $set: {
        lastSyncAt,
        lastSyncStatus,
        'syncProgress.done': done,
        ...(hasErrors ? { lastSyncError: lastError } : {})
      },
      $unset: {
        'syncProgress.currentArtefact': '',
        ...(hasErrors ? {} : { lastSyncError: '' })
      }
    }
  )

  // The end event carries the terminal state, so the UI never refetches to learn the outcome.
  await emitSync(remoteRegistryId, {
    running: false,
    startedAt,
    done,
    total,
    lastSyncAt,
    lastSyncStatus,
    ...(hasErrors ? { lastSyncError: lastError } : {})
  })
}
```

`syncProgress` is deliberately **not** unset at the end: `syncState` needs `startedAt` to sit behind `lastSyncAt` to conclude `idle`, and a stranded `startedAt` is exactly what makes a crashed run render as `interrupted`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test tests/remote-registries.api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Verify a crashed run renders as interrupted**

There is no automated test for this (it requires killing the API mid-sync). Assert the derivation by hand against the shipped helper:

Run: `npm run test tests/remote-registries-operations.unit.spec.ts -g "stranded ahead"`
Expected: PASS. This is the same function the router calls.

- [ ] **Step 6: Commit**

```bash
git add api/src/remote-registries/sync.ts tests/remote-registries.api.spec.ts
git commit -m "feat(api): persist and publish sync progress"
```

---

### Task 7: UI sync composable

**Files:**
- Create: `ui/src/composables/registry-sync.ts`

**Interfaces:**
- Consumes: `syncChannel`'s wire format (Task 1); `SyncEvent` (Task 6).
- Produces: `useRegistrySync(registryId: string, registry: Ref<any>): void` — subscribes and folds events into `registry.value`.

- [ ] **Step 1: Create the composable**

```ts
import { type Ref } from 'vue'
import useWS from '@data-fair/lib-vue/ws.js'
import { $apiPath } from '~/context'

// Mirrors SyncEvent in api/src/remote-registries/sync.ts
export type SyncEvent = {
  running: boolean
  startedAt: string
  done: number
  total: number
  currentArtefact?: string
  lastSyncAt?: string
  lastSyncStatus?: 'success' | 'error'
  lastSyncError?: string
}

// Subscribes to a registry's sync channel and folds each event into the registry ref.
// `subscribe` registers its own onScopeDispose teardown, so callers need no onUnmounted.
// useWS returns undefined when the browser has no WebSocket: the page then renders correct
// state at load and simply does not animate.
export const useRegistrySync = (registryId: string, registry: Ref<any>) => {
  const ws = useWS($apiPath + '/')
  ws?.subscribe<SyncEvent>(`remote-registries/${encodeURIComponent(registryId)}/sync`, (event) => {
    const reg = registry.value
    // an event can land before the initial fetch resolves; the next one supersedes it
    if (!reg) return

    reg.syncProgress = {
      startedAt: event.startedAt,
      done: event.done,
      total: event.total,
      currentArtefact: event.currentArtefact
    }

    if (event.running) {
      reg.syncState = 'running'
      return
    }

    reg.syncState = 'idle'
    reg.lastSyncAt = event.lastSyncAt
    reg.lastSyncStatus = event.lastSyncStatus
    reg.lastSyncError = event.lastSyncError
  })
}
```

Imports are explicit rather than relying on auto-import: a newly created file's own auto-imports are not picked up by an already-running vite dev server.

- [ ] **Step 2: Type-check**

Run: `npm run check-types`
Expected: exits 0.

- [ ] **Step 3: Lint**

Run: `npm run lint-fix`
Expected: exits 0, no remaining errors.

- [ ] **Step 4: Commit**

```bash
git add ui/src/composables/registry-sync.ts
git commit -m "feat(ui): composable subscribing to a registry's sync channel"
```

---

### Task 8: Live sync panel on the detail page

**Files:**
- Modify: `ui/src/pages/admin/remote-registries/[id].vue`

**Interfaces:**
- Consumes: `useRegistrySync` (Task 7); `syncState` / `syncProgress` on `GET /:id` (Tasks 4, 6); `409` from `POST /:id/sync` (Task 5).
- Produces: nothing downstream.

- [ ] **Step 1: Wire the composable and the derived flags**

In the `<script setup>` block, add to the imports:

```ts
import { useRegistrySync } from '~/composables/registry-sync'
```

After the existing `const registryId = computed(...)` and `const registry = ref<any>(null)` declarations, add:

```ts
const { sendUiNotif } = useUiNotif()

useRegistrySync(registryId.value, registry)

const syncRunning = computed(() => registry.value?.syncState === 'running')
const syncInterrupted = computed(() => registry.value?.syncState === 'interrupted')
const syncPercent = computed(() => {
  const progress = registry.value?.syncProgress
  if (!progress?.total) return 0
  return Math.round((progress.done / progress.total) * 100)
})
```

- [ ] **Step 2: Replace `syncAction`**

Replace the whole existing `syncAction` block (the one calling `setTimeout(fetchRegistry, 2000)`):

```ts
const syncAction = useAsyncAction(
  async () => {
    try {
      await $fetch(`/v1/remote-registries/${encodeURIComponent(registryId.value)}/sync`, {
        method: 'POST'
      })
      // optimistic: the first ws progress event confirms it within milliseconds
      if (registry.value) registry.value.syncState = 'running'
      sendUiNotif({ type: 'success', msg: t('syncStarted') })
    } catch (err: any) {
      // losing the race with a peer replica or another admin is not a fault
      if ((err.status ?? err.statusCode) === 409) {
        sendUiNotif({ type: 'warning', msg: t('syncAlreadyRunning') })
        await fetchRegistry()
        return
      }
      throw err
    }
  }
)
```

The `{ success: t('syncStarted') }` option is dropped: it would fire on the 409 path too.

- [ ] **Step 3: Replace the sync status card template**

Replace the whole `<!-- Sync status -->` `v-card`:

```vue
    <!-- Sync status -->
    <v-card class="mb-4">
      <v-card-title>
        {{ t('syncStatus') }}
        <v-chip
          v-if="syncRunning"
          size="small"
          color="info"
          class="ml-2"
        >
          {{ t('running') }}
        </v-chip>
        <v-chip
          v-else-if="syncInterrupted"
          size="small"
          color="warning"
          class="ml-2"
        >
          {{ t('interrupted') }}
        </v-chip>
        <v-chip
          v-else-if="registry.lastSyncStatus"
          size="small"
          :color="registry.lastSyncStatus === 'success' ? 'success' : 'error'"
          class="ml-2"
        >
          {{ registry.lastSyncStatus }}
        </v-chip>
      </v-card-title>
      <v-card-text>
        <template v-if="syncRunning && registry.syncProgress">
          <v-progress-linear
            :model-value="syncPercent"
            :indeterminate="!registry.syncProgress.total"
            height="6"
            rounded
            color="info"
            class="mb-2"
          />
          <div class="text-body-2">
            {{ registry.syncProgress.done }} / {{ registry.syncProgress.total }}
            <template v-if="registry.syncProgress.currentArtefact">
              — <code>{{ registry.syncProgress.currentArtefact }}</code>
            </template>
          </div>
          <div class="text-medium-emphasis text-body-2">
            {{ t('startedAt') }}: {{ dayjs(registry.syncProgress.startedAt).format('LT') }}
          </div>
        </template>

        <template v-else-if="syncInterrupted && registry.syncProgress">
          <div>
            {{ t('stoppedAt', { done: registry.syncProgress.done, total: registry.syncProgress.total }) }}
          </div>
          <div class="text-medium-emphasis text-body-2">
            {{ t('startedAt') }}: {{ dayjs(registry.syncProgress.startedAt).format('L LT') }}
          </div>
        </template>

        <div v-if="!syncRunning && registry.lastSyncAt">
          {{ t('lastSyncAt') }}: {{ dayjs(registry.lastSyncAt).format('L LT') }}
        </div>
        <div
          v-if="!syncRunning && registry.lastSyncError"
          class="text-error mt-1"
        >
          {{ registry.lastSyncError }}
        </div>
        <div
          v-if="!syncRunning && !syncInterrupted && !registry.lastSyncAt"
          class="text-medium-emphasis"
        >
          {{ t('neverSynced') }}
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="syncRunning"
          :loading="syncAction.loading.value"
          @click="syncAction.execute()"
        >
          {{ t('syncNow') }}
        </v-btn>
      </v-card-actions>
    </v-card>
```

- [ ] **Step 4: Add the i18n keys**

In the `<i18n>` block, add to `fr:`

```yaml
  running: en cours
  interrupted: interrompue
  startedAt: Démarrée à
  stoppedAt: Arrêtée à {done}/{total} artefacts
  syncAlreadyRunning: Une synchronisation est déjà en cours
```

and to `en:`

```yaml
  running: running
  interrupted: interrupted
  startedAt: Started at
  stoppedAt: Stopped at {done}/{total} artefacts
  syncAlreadyRunning: A sync is already running
```

- [ ] **Step 5: Verify against the real app**

Run: `bash dev/status.sh`
Expected: api and ui both up. If not, ask the user to start them — never start them yourself.

Then, as `superadmin` in admin mode, open `/registry/admin/remote-registries/<encoded url>`:

1. With no sync running, the button is enabled and the panel shows the last sync or "never synced".
2. Click **Sync now**. The chip flips to *running*, the progress bar appears, the button greys out — with no page refresh, and no request in the network tab beyond the initial POST.
3. When it finishes the chip flips to *success* and the button re-enables, again with no refetch.
4. Click **Sync now** twice fast: the second click is inert (button disabled). Force a 409 by holding the lock via `PUT /api/test-env/locks/<encoded lock id>` and clicking once — expect the warning notification, not a red error.

- [ ] **Step 6: Lint and type-check**

Run: `npm run lint-fix && npm run check-types`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/admin/remote-registries/\[id\].vue
git commit -m "feat(ui): live sync progress on the remote registry page"
```

---

### Task 9: Sync state on the admin list, and full quality gate

The list is a navigation surface, not a monitor: it reads `syncState` from `GET /` and is correct at load, but does not subscribe and does not animate.

**Files:**
- Modify: `ui/src/components/admin/remote-registries-section.vue`

**Interfaces:**
- Consumes: `syncState` / `syncProgress` on `GET /` (Tasks 4, 6).
- Produces: nothing downstream.

- [ ] **Step 1: Replace the last-sync cell**

Replace the `<td>` containing the `reg.lastSyncAt` template:

```vue
            <td>
              <template v-if="reg.syncState === 'running'">
                <v-chip
                  size="small"
                  color="info"
                >
                  {{ t('running') }}
                </v-chip>
                <span
                  v-if="reg.syncProgress"
                  class="text-medium-emphasis text-body-2 ml-1"
                >{{ reg.syncProgress.done }}/{{ reg.syncProgress.total }}</span>
              </template>
              <template v-else-if="reg.syncState === 'interrupted'">
                <v-chip
                  size="small"
                  color="warning"
                >
                  {{ t('interrupted') }}
                </v-chip>
              </template>
              <template v-else-if="reg.lastSyncAt">
                <v-chip
                  size="small"
                  :color="reg.lastSyncStatus === 'success' ? 'success' : 'error'"
                >
                  {{ reg.lastSyncStatus }}
                </v-chip>
                {{ dayjs(reg.lastSyncAt).format('L LT') }}
              </template>
              <span
                v-else
                class="text-medium-emphasis"
              >{{ t('neverSynced') }}</span>
            </td>
```

- [ ] **Step 2: Add the i18n keys**

To `fr:` add `running: en cours` and `interrupted: interrompue`.
To `en:` add `running: running` and `interrupted: interrupted`.

- [ ] **Step 3: Verify against the real app**

Hold a lock via the dev endpoint, load `/registry/admin#remote-registries`, and confirm the row shows the *running* chip with `0/N`. Release the lock, reload, confirm it reverts.

- [ ] **Step 4: Run the full quality gate**

Run: `npm run quality`
Expected: lint, check-types and the whole test suite all exit 0. Do not claim completion on a partial run — paste the failing output if anything trips.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/admin/remote-registries-section.vue
git commit -m "feat(ui): sync state chip on the remote registries list"
```

---

## Self-review notes

**Spec coverage.** Data model → Task 2. `syncState` derivation → Task 1. Sync module split → Task 5. Callers diverge (409 vs silent) → Task 5. Reads enrich from the lock → Task 4. Server wiring → Task 3. Emit failures wrapped → Task 6. Composable → Task 7. Detail page (three states, disabled button, 409 notice) → Task 8. List page → Task 9. Degradation via `ws?.` → Task 7. `test-env` lock endpoints + `clean()` → Task 4. Unit specs → Tasks 1, 6. "No migration" → honoured; no upgrade script anywhere.

**Type consistency.** `syncState` is the function name in `operations.ts` *and* the response field name — deliberate, and they never collide because the field is built as `syncState: syncState(...)`. `SyncEvent` is declared in `sync.ts` (Task 6) and mirrored structurally in `registry-sync.ts` (Task 7); the UI cannot import from `api/src`, and the `shared` workspace is an unused stub, so the mirror is intentional and carries a comment pointing at its source of truth.

**Known non-obvious risk.** Task 5 changes `syncAllRemoteRegistries` to call `syncRemoteRegistry` (awaiting) rather than the new `startSync` (non-blocking). Using `startSync` there would silently turn the daily job from sequential into a parallel fan-out across every remote. The two functions exist precisely to keep that distinction explicit.
