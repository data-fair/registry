# Federation sync: observable running state

Date: 2026-07-09
Branch: `feat-better-sync-ui`

## Problem

Remote-registry sync is opaque while it runs.

- `syncRemoteRegistry` acquires a Mongo lock (`sync-remote-<url>`) but the result is
  invisible: a held lock produces a `console.log` and a silent return.
- `POST /:id/sync` fires the sync with `.catch()` and answers `202 {message: 'sync started'}`
  unconditionally — including when nothing started.
- The registry doc carries only `lastSyncAt` / `lastSyncStatus` / `lastSyncError`. Nothing
  describes an attempt in flight.
- The detail page waits a hardcoded `setTimeout(fetchRegistry, 2000)` and hopes.
- Nothing prevents a second click while a sync runs.

## Approach

Three mechanisms, one job each. No mechanism is asked to do a second job.

| Mechanism | Answers | Why it |
|---|---|---|
| Mongo lock (`locks` collection) | *Is it running?* | Already there. Cross-replica. Self-heals on crash via 60s TTL. |
| `syncProgress` field on the doc | *How far did it get?* | Survives the process. Renders on page load before the first event. |
| WebSocket (`ws-messages` capped collection) | *What just changed?* | Push, no polling. Cross-replica via tailable cursor. |

A stored `status: 'running'` is a lie the moment a pod is evicted. Running state is therefore
**derived from the lock**, never stored.

Everything needed is already installed:

- `@data-fair/lib-express/ws-server.js` — `start(server, db, canSubscribe)`
- `@data-fair/lib-node/ws-emitter.js` — `init(db)`, `emit(channel, data)`
- `useWS` from lib-vue, already auto-imported (`ui/dts/auto-imports.d.ts:102`)
- `dev/resources/nginx.conf.template` already sets `Upgrade`/`Connection` and
  `proxy_read_timeout 86400`

## Data model

Add to `api/types/remote-registry/schema.js`, then `npm run build-types`:

```js
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
}
```

`lastSyncAt` / `lastSyncStatus` / `lastSyncError` are unchanged. `syncProgress` describes the
**last attempt**, finished or not.

**No migration.** `syncProgress` is absent on existing docs; every derivation treats absent as
"no attempt recorded". No upgrade script.

## Derived state

`syncState` is computed, never persisted. It lives in `api/src/remote-registries/operations.ts`
(pure, already has `tests/remote-registries-operations.unit.spec.ts` beside it) and is returned
by the read endpoints:

```ts
export type SyncState = 'running' | 'interrupted' | 'idle'

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

`interrupted` means the final write that sets `lastSyncAt` never happened, so the attempt's
`startedAt` is stranded ahead of it — a crash, an eviction, or a `runSync` that threw.

> **Deviation from the reviewed design sketch.** That sketch had the UI derive `interrupted`
> and floated sharing `operations.ts` via the `shared` workspace. `shared/` is an empty stub
> nothing imports; wiring it up for four lines is not worth it. Instead the **API** computes
> `syncState` and the UI reads it. No duplication, no new workspace wiring, and the derivation
> stays covered by the existing api-side unit spec.

## Backend

### Sync module (`api/src/remote-registries/sync.ts`)

`syncRemoteRegistry` splits in two. This is the change that makes `409` possible at all: today
the lock is acquired *inside* the background task, so the route has already answered `202`
before anyone knows whether the sync started.

```ts
const lockId = (id: string) => `sync-remote-${id}`
const channel = (id: string) => `remote-registries/${encodeURIComponent(id)}/sync`

// Acquires synchronously; returns false if already held. The caller decides what that means.
export const startSync = async (id: string): Promise<boolean> => {
  if (!await locks.acquire(lockId(id))) return false
  runSync(id).finally(() => locks.release(lockId(id)))
  return true
}
```

`encodeURIComponent` in `channel()` is load-bearing: the registry `_id` **is a URL**, and a raw
`/` would shred a `/`-delimited channel name.

`runSync` writes `syncProgress` and emits on that channel at each step — start, after each
artefact, and end. This follows `data-fair`'s `api/src/datasets/utils/task-progress.ts`
(emit *and* persist), minus its 250ms throttling: `total` here is the number of selected
artefacts, a handful, not 100k rows.

The end event carries the terminal state, so the UI never refetches to learn the outcome:

```ts
type SyncEvent = {
  running: boolean
  startedAt: string
  done: number
  total: number
  currentArtefact?: string
  lastSyncAt?: string          // end event only
  lastSyncStatus?: 'success' | 'error'
  lastSyncError?: string
}
```

Per-artefact error handling is unchanged: one artefact failing keeps the loop going and lands
in `lastSyncError`.

### Callers diverge

A held lock means different things to a human and to a timer.

```ts
// router: POST /:id/sync — a conflict a human should see
if (!await startSync(req.params.id)) throw httpError(409, 'sync already running')
res.status(202).json({ message: 'sync started' })

// syncAllRemoteRegistries — a held lock means a peer replica has it. Normal. Not an error.
for (const remote of remotes) await startSync(remote._id)
```

The daily `setInterval` fires in **every** API replica; the lock is what dedupes them. It must
keep swallowing the failure silently.

### Reads

`GET /` and `GET /:id` gain `syncState`. One query, not N:

```ts
mongo.db.collection('locks').find({ _id: { $in: ids.map(lockId) } })
```

Both endpoints already return the whole doc minus `apiKey`, so `syncProgress` and `lastSync*`
come along for free; only `syncState` is added. The list page can therefore show `3/7` on a
running row without a second request.

### Server wiring (`api/src/server.ts`)

After `locks.start(mongo.db)`:

```ts
await wsEmitter.init(mongo.db)
await wsServer.start(server, mongo.db, async () => false)
```

and `await wsServer.stop()` in `stop()`.

`async () => false` is the entire permission model. `ws-server.js` short-circuits on
`sessionState.user?.adminMode` *before* calling `canSubscribe`; remote-registry sync is an
admin-only surface, so admins pass and everyone else gets 403. No permission logic to write.

### Emit failures

`wsEmitter.emit` is wrapped and never aborts a sync. A dropped progress frame is cosmetic and
the next frame supersedes it.

## UI

### Composable (`ui/src/composables/registry-sync.ts`)

Owns the socket; the page stays declarative. Takes the `registry` ref, subscribes to
`remote-registries/${encodeURIComponent(id)}/sync`, folds each event into the ref:
`syncProgress` from every event, and on the end event the `lastSync*` fields plus
`syncState = 'idle'`.

Socket path is `useWS($apiPath + '/')` — `$apiPath` is `$sitePath + '/registry/api'`
(`ui/src/context.ts:9`), so this survives a non-empty `$sitePath`. (data-fair hardcodes
`useWS('/data-fair/api/')`; we should not.)

`subscribe()` registers its own `onScopeDispose` teardown — no `onUnmounted` needed.

Import it explicitly (`import { useRegistrySync } from '~/composables/registry-sync'`), matching
how `[id].vue` already imports `~/composables/breadcrumbs`. A new file is not picked up by a
running vite dev server's auto-import.

### Detail page (`ui/src/pages/admin/remote-registries/[id].vue`)

- `syncAction` loses `setTimeout(fetchRegistry, 2000)` entirely.
- `:disabled="registry.syncState === 'running'"` closes the double-click hole locally; the lock
  closes it globally.
- On `409`: show an "already running" notice and refresh — the race-loser's path, not a fault.
- `running`: progress line, `done/total`, `currentArtefact`.
- `interrupted`: "stopped at 3/7, started HH:MM" plus the last *completed* sync below it.
- `idle`: today's `lastSyncStatus` chip and timestamp.

### List page (`ui/src/components/admin/remote-registries-section.vue`)

Reads `syncState` per row from `GET /`. Correct at load and after any refresh; does not animate.
One channel, one subscription, on the one page a human actually watches. The list is a
navigation surface, not a monitor.

### Degradation

`useWS` returns `undefined` when `window.WebSocket` is missing, so every call is
`ws?.subscribe(...)`. Without a socket the page renders correct state at load and simply does not
animate; the button un-disables on the next navigation or refresh. This is a deliberate trade —
we are not reintroducing a polling fallback we just removed.

## Testing

The `409` path needs a sync that is reliably still running when the second request lands. A sync
against a fake remote is far too fast to race. So don't race it — hold the lock directly.

`api/src/app.ts:43` already gates a `test-env` router on `NODE_ENV === 'development'`. Add:

```ts
app.put('/api/test-env/locks/:id', ...)      // insert a lock row with a FOREIGN pid
app.delete('/api/test-env/locks/:id', ...)
```

A foreign `pid` matters: `locks.release()` deletes on `{_id, pid: this.pid}`, so the API process
can neither release nor prolong a lock it did not take, and the row expires on its own via the
TTL if a test forgets to clean up. `DELETE /api/test-env` (the `clean()` helper) also drops the
`locks` collection, so a stranded lock cannot leak into the next test.

Deterministic, no timing:

- `tests/remote-registries.api.spec.ts`
  - `POST /:id/sync` with the lock held → `409`; with it free → `202`.
  - `GET /:id` and `GET /` report `syncState: 'running'` while held, `'idle'` after release.
  - A sync over zero selected artefacts completes: `lastSyncStatus: 'success'`,
    `syncProgress.total: 0`.
- `tests/remote-registries-operations.unit.spec.ts`
  - `syncState`: locked; `startedAt` after `lastSyncAt`; `startedAt` before it; `syncProgress`
    absent; `lastSyncAt` absent.
  - `channel()` encodes the registry URL (the part we can actually get wrong).

### Deliberately not tested

Asserting a websocket frame actually arrives means standing up a `ws` client inside the api
spec, authenticating the handshake through simple-directory, and racing the tailable cursor's
startup — a slow, flaky test guarding a transport we did not write. The emit *call site* is
unit-asserted (once per artefact, right channel). Delivery is lib-express's problem.

## Out of scope

- Per-artefact result table (`updated` / `unchanged` / `error+message` per artefact). A real
  feature: persisted array, schema change, new UI component. Deferred.
- Cancelling a running sync.
- Live-updating the admin list page.
- Replacing the 24h `setInterval` with a real scheduler.
