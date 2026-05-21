import { test, expect } from '@playwright/test'
import { filterSuggestedArtefacts } from '../api/src/remote-registries/operations.ts'

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
