import { test, expect } from '@playwright/test'
import { filterSuggestedArtefacts, syncLockId, syncChannel, syncState } from '../api/src/remote-registries/operations.ts'

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
