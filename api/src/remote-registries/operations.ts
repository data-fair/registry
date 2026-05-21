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
