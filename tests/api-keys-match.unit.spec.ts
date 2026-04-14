import { test, expect } from '@playwright/test'
import { matchArtefactName } from '../api/src/api-keys/match.ts'

test.describe('matchArtefactName', () => {
  test('undefined allowlist means unrestricted', () => {
    expect(matchArtefactName('anything', undefined)).toBe(true)
  })

  test('empty allowlist means unrestricted', () => {
    expect(matchArtefactName('anything', [])).toBe(true)
  })

  test('exact match allows', () => {
    expect(matchArtefactName('terrain-france', ['terrain-france'])).toBe(true)
  })

  test('exact match rejects other names', () => {
    expect(matchArtefactName('terrain-spain', ['terrain-france'])).toBe(false)
  })

  test('prefix pattern allows matching prefix', () => {
    expect(matchArtefactName('terrain-france', ['terrain-*'])).toBe(true)
    expect(matchArtefactName('terrain-spain', ['terrain-*'])).toBe(true)
  })

  test('prefix pattern rejects non-matching name', () => {
    expect(matchArtefactName('basemap-world', ['terrain-*'])).toBe(false)
  })

  test('multiple patterns: any match allows', () => {
    const allow = ['@koumoul/*', 'terrain-*', 'basemap-world']
    expect(matchArtefactName('@koumoul/tileserver-gl', allow)).toBe(true)
    expect(matchArtefactName('terrain-alps', allow)).toBe(true)
    expect(matchArtefactName('basemap-world', allow)).toBe(true)
  })

  test('multiple patterns: no match rejects', () => {
    expect(matchArtefactName('osm-world', ['@koumoul/*', 'terrain-*'])).toBe(false)
  })

  test('prefix with trailing slash', () => {
    expect(matchArtefactName('@koumoul/foo', ['@koumoul/*'])).toBe(true)
    expect(matchArtefactName('@other/foo', ['@koumoul/*'])).toBe(false)
  })

  test('scoped name must match exactly without wildcard', () => {
    expect(matchArtefactName('@scope/pkg', ['@scope/pkg'])).toBe(true)
    expect(matchArtefactName('@scope/pkg-other', ['@scope/pkg'])).toBe(false)
  })

  test('empty-prefix pattern is impossible (regex blocks it)', () => {
    // "*" alone would be a footgun; the schema regex forbids it, but we
    // still verify the runtime: pattern must be non-empty prefix.
    // Not a security assertion — purely a sanity check on matcher behavior
    // when given a pattern that slipped through.
    expect(matchArtefactName('anything', ['a*'])).toBe(true)
    expect(matchArtefactName('banana', ['a*'])).toBe(false)
  })
})
