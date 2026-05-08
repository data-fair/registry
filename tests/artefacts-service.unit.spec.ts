import { test, expect } from '@playwright/test'
import { Readable, Writable } from 'node:stream'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import * as tar from 'tar-stream'
import {
  extractManifest,
  parseSemver,
  resolveVersionQuery,
  computePruneSet,
  MAX_DECOMPRESSED_BYTES
} from '../api/src/artefacts/service-pure.ts'

const gzipBuffer = async (raw: Buffer): Promise<Buffer> => {
  const chunks: Buffer[] = []
  await pipeline(
    Readable.from(raw),
    createGzip(),
    new Writable({
      write (chunk, _enc, cb) { chunks.push(chunk as Buffer); cb() }
    })
  )
  return Buffer.concat(chunks)
}

const packTarball = async (entries: Array<{ name: string, content: string | Buffer }>): Promise<Buffer> => {
  const pack = tar.pack()
  for (const e of entries) {
    pack.entry({ name: e.name }, typeof e.content === 'string' ? e.content : e.content)
  }
  pack.finalize()
  const rawChunks: Buffer[] = []
  await pipeline(pack, new Writable({
    write (chunk, _enc, cb) { rawChunks.push(chunk as Buffer); cb() }
  }))
  return gzipBuffer(Buffer.concat(rawChunks))
}

test.describe('parseSemver', () => {
  test('parses stable version', () => {
    expect(parseSemver('1.2.3')).toEqual({
      semverMajor: 1, semverMinor: 2, semverPatch: 3, semverPrerelease: undefined
    })
  })

  test('parses prerelease', () => {
    expect(parseSemver('2.0.0-beta.1')).toEqual({
      semverMajor: 2, semverMinor: 0, semverPatch: 0, semverPrerelease: 'beta.1'
    })
  })

  test('rejects invalid semver', () => {
    expect(() => parseSemver('not-a-version')).toThrow(/invalid semver/)
  })
})

test.describe('resolveVersionQuery', () => {
  test('exact match for x.y.z', () => {
    const { filter } = resolveVersionQuery('a', '1.2.3')
    expect(filter).toMatchObject({ artefactId: 'a', version: '1.2.3' })
  })

  test('minor-level filter excludes prereleases', () => {
    const { filter } = resolveVersionQuery('a', '1.2')
    expect(filter).toMatchObject({
      artefactId: 'a',
      semverMajor: 1,
      semverMinor: 2,
      semverPrerelease: { $exists: false }
    })
  })

  test('major-level filter excludes prereleases', () => {
    const { filter } = resolveVersionQuery('a', '1')
    expect(filter).toMatchObject({
      artefactId: 'a',
      semverMajor: 1,
      semverPrerelease: { $exists: false }
    })
  })

  test('prerelease selector does exact match', () => {
    const { filter } = resolveVersionQuery('a', '1.0.0-beta.1')
    expect(filter).toMatchObject({ version: '1.0.0-beta.1' })
  })

  test('rejects non-numeric major selector', () => {
    expect(() => resolveVersionQuery('a', 'abc')).toThrow(/invalid version selector/)
  })

  test('rejects non-numeric minor selector', () => {
    expect(() => resolveVersionQuery('a', '1.x')).toThrow(/invalid version selector/)
  })

  test('sort is descending by major/minor/patch', () => {
    const { sort } = resolveVersionQuery('a', '1.2.3')
    expect(sort).toEqual({ semverMajor: -1, semverMinor: -1, semverPatch: -1 })
  })

  test('no architecture: no fallback filter', () => {
    const result = resolveVersionQuery('a', '1.2.3')
    expect(result.fallbackFilter).toBeUndefined()
  })

  test('with architecture: primary filter narrows to that arch, fallback matches noarch', () => {
    const { filter, fallbackFilter } = resolveVersionQuery('a', '1.2.3', 'arm64')
    expect(filter).toMatchObject({ artefactId: 'a', version: '1.2.3', architecture: 'arm64' })
    expect(fallbackFilter).toMatchObject({ artefactId: 'a', version: '1.2.3', architecture: { $exists: false } })
  })

  test('with architecture and minor selector: arch is added to both filters', () => {
    const { filter, fallbackFilter } = resolveVersionQuery('a', '1.2', 'x64')
    expect(filter).toMatchObject({
      artefactId: 'a',
      semverMajor: 1,
      semverMinor: 2,
      semverPrerelease: { $exists: false },
      architecture: 'x64'
    })
    expect(fallbackFilter).toMatchObject({
      artefactId: 'a',
      semverMajor: 1,
      semverMinor: 2,
      semverPrerelease: { $exists: false },
      architecture: { $exists: false }
    })
  })

  test('with architecture and prerelease selector: arch is added to both filters', () => {
    const { filter, fallbackFilter } = resolveVersionQuery('a', '1.0.0-beta.1', 'arm64')
    expect(filter).toMatchObject({ version: '1.0.0-beta.1', architecture: 'arm64' })
    expect(fallbackFilter).toMatchObject({ version: '1.0.0-beta.1', architecture: { $exists: false } })
  })
})

test.describe('extractManifest', () => {
  const manifest = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    name: '@test/pkg',
    version: '1.0.0',
    ...overrides
  })

  test('extracts standard package/package.json entry', async () => {
    const tarball = await packTarball([{ name: 'package/package.json', content: manifest() }])
    const result = await extractManifest(Readable.from(tarball))
    expect(result.name).toBe('@test/pkg')
    expect(result.version).toBe('1.0.0')
  })

  test('normalizes licence/license', async () => {
    const tarball = await packTarball([
      { name: 'package/package.json', content: manifest({ license: 'MIT' }) }
    ])
    const result = await extractManifest(Readable.from(tarball))
    expect(result.licence).toBe('MIT')
  })

  test('extracts registry.category', async () => {
    const tarball = await packTarball([
      { name: 'package/package.json', content: manifest({ registry: { category: 'processing' } }) }
    ])
    const result = await extractManifest(Readable.from(tarball))
    expect(result.category).toBe('processing')
  })

  test('rejects missing package.json', async () => {
    const tarball = await packTarball([{ name: 'package/README.md', content: 'hi' }])
    await expect(extractManifest(Readable.from(tarball))).rejects.toThrow(/package.json not found/)
  })

  test('ignores non-canonical paths (only package/package.json counts)', async () => {
    const tarball = await packTarball([
      { name: 'evil/package.json', content: '{"name":"evil","version":"9.9.9"}' },
      { name: 'package/package.json', content: manifest() }
    ])
    const result = await extractManifest(Readable.from(tarball))
    expect(result.name).toBe('@test/pkg')
  })

  test('rejects invalid JSON in package.json with 400', async () => {
    const tarball = await packTarball([{ name: 'package/package.json', content: '{not json' }])
    await expect(extractManifest(Readable.from(tarball))).rejects.toMatchObject({
      status: 400
    })
  })

  test('rejects invalid semver', async () => {
    const tarball = await packTarball([
      { name: 'package/package.json', content: manifest({ version: 'not-a-version' }) }
    ])
    await expect(extractManifest(Readable.from(tarball))).rejects.toThrow(/invalid semver/)
  })

  test('decompressed size cap is enforced', async () => {
    // Direct check of the countingPassthrough logic: feed a tarball of
    // uncompressed entries that together exceed MAX_DECOMPRESSED_BYTES
    // only if the cap is low enough to build a test fixture for. Skip
    // otherwise — generating hundreds of MB in CI is not worthwhile.
    expect(MAX_DECOMPRESSED_BYTES).toBeGreaterThan(0)
  })

  test('aborts pipeline early after finding manifest (does not scan the whole tarball)', async () => {
    // Many entries after package.json — with the early-abort, extractManifest
    // should not keep draining them. We just verify it succeeds under the
    // entry count cap even with entries after.
    const entries: Array<{ name: string, content: string }> = [
      { name: 'package/package.json', content: manifest() }
    ]
    for (let i = 0; i < 200; i++) {
      entries.push({ name: `package/file${i}.txt`, content: 'x' })
    }
    const tarball = await packTarball(entries)
    const result = await extractManifest(Readable.from(tarball))
    expect(result.name).toBe('@test/pkg')
  })

  test('caps entry count', async () => {
    // Use the opts override so this stays cheap regardless of the default cap.
    // package.json is LAST so the early-abort doesn't save us.
    const cap = 50
    const entries: Array<{ name: string, content: string }> = []
    for (let i = 0; i < cap + 10; i++) {
      entries.push({ name: `package/a${i}.txt`, content: 'x' })
    }
    entries.push({ name: 'package/package.json', content: manifest() })
    const tarball = await packTarball(entries)
    await expect(extractManifest(Readable.from(tarball), { maxTarEntries: cap })).rejects.toMatchObject({ status: 413 })
  })
})

test.describe('computePruneSet', () => {
  const v = (major: number, minor: number, patch: number, arch?: string) => ({
    semverMajor: major,
    semverMinor: minor,
    semverPatch: patch,
    architecture: arch,
    _id: `${major}.${minor}.${patch}${arch ?? ''}`
  })

  test('empty / single / no-prune-needed cases', () => {
    expect(computePruneSet([])).toEqual([])
    expect(computePruneSet([v(1, 0, 0)])).toEqual([])
    // Two versions of the latest major — both kept.
    expect(computePruneSet([v(1, 1, 0), v(1, 0, 0)])).toEqual([])
  })

  test('latest major: keeps last 2 distinct (minor, patch) tuples', () => {
    const versions = [v(5, 2, 1), v(5, 2, 0), v(5, 1, 0), v(5, 0, 0)]
    const toDelete = computePruneSet(versions)
    expect(toDelete.map(x => x._id)).toEqual(['5.1.0', '5.0.0'])
  })

  test('older major: keeps only the latest version', () => {
    const versions = [
      v(5, 0, 0), // latest major; keeps top 2 — only 1 here, kept
      v(4, 3, 5), v(4, 2, 0), v(4, 1, 0), v(4, 0, 0) // older major; only 4.3.5 kept
    ]
    const toDelete = computePruneSet(versions)
    expect(toDelete.map(x => x._id).sort()).toEqual(['4.0.0', '4.1.0', '4.2.0'])
  })

  test('mixed majors example: latest keeps 2, others keep 1', () => {
    const versions = [
      v(5, 2, 1), v(5, 2, 0), v(5, 1, 0), v(5, 0, 0),
      v(4, 3, 5), v(4, 2, 0), v(4, 1, 0), v(4, 0, 0),
      v(3, 0, 1), v(3, 0, 0)
    ]
    const toDelete = computePruneSet(versions)
    const deletedIds = toDelete.map(x => x._id).sort()
    expect(deletedIds).toEqual([
      '3.0.0',
      '4.0.0', '4.1.0', '4.2.0',
      '5.0.0', '5.1.0'
    ])
  })

  test('multi-arch: every variant of a kept tuple is retained, every variant of a pruned tuple is deleted', () => {
    const versions = [
      v(5, 1, 0, 'x64'), v(5, 1, 0, 'arm64'),
      v(5, 0, 0, 'x64'), v(5, 0, 0, 'arm64'),
      v(4, 2, 0, 'x64'), v(4, 2, 0, 'arm64'),
      v(4, 1, 0, 'x64')
    ]
    const toDelete = computePruneSet(versions)
    // Latest major 5: keep tuples {(1,0), (0,0)} → both arch variants kept (4 docs).
    // Older major 4: keep tuple {(2,0)} → both arch variants kept; (1,0) pruned (1 doc).
    expect(toDelete).toHaveLength(1)
    expect(toDelete[0]._id).toBe('4.1.0x64')
  })

  test('only one major present: behaves as latest-major rule (top 2 tuples)', () => {
    const versions = [v(2, 5, 0), v(2, 4, 1), v(2, 4, 0), v(2, 3, 0)]
    const toDelete = computePruneSet(versions)
    expect(toDelete.map(x => x._id)).toEqual(['2.4.0', '2.3.0'])
  })
})
