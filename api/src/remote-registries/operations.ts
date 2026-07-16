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
