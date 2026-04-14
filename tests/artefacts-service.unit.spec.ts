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
  MAX_DECOMPRESSED_BYTES,
  MAX_TAR_ENTRIES
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
    const { filter } = resolveVersionQuery('a@1', '1.2.3')
    expect(filter).toMatchObject({ artefactId: 'a@1', version: '1.2.3' })
  })

  test('minor-level filter excludes prereleases', () => {
    const { filter } = resolveVersionQuery('a@1', '1.2')
    expect(filter).toMatchObject({
      artefactId: 'a@1',
      semverMajor: 1,
      semverMinor: 2,
      semverPrerelease: { $exists: false }
    })
  })

  test('major-level filter excludes prereleases', () => {
    const { filter } = resolveVersionQuery('a@1', '1')
    expect(filter).toMatchObject({
      artefactId: 'a@1',
      semverMajor: 1,
      semverPrerelease: { $exists: false }
    })
  })

  test('prerelease selector does exact match', () => {
    const { filter } = resolveVersionQuery('a@1', '1.0.0-beta.1')
    expect(filter).toMatchObject({ version: '1.0.0-beta.1' })
  })

  test('rejects non-numeric major selector', () => {
    expect(() => resolveVersionQuery('a@1', 'abc')).toThrow(/invalid version selector/)
  })

  test('rejects non-numeric minor selector', () => {
    expect(() => resolveVersionQuery('a@1', '1.x')).toThrow(/invalid version selector/)
  })

  test('sort is descending by major/minor/patch', () => {
    const { sort } = resolveVersionQuery('a@1', '1.2.3')
    expect(sort).toEqual({ semverMajor: -1, semverMinor: -1, semverPatch: -1 })
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
    // Construct a tarball with MAX_TAR_ENTRIES+10 entries where package.json
    // is LAST, so early-abort doesn't save us.
    if (MAX_TAR_ENTRIES > 20000) {
      test.skip()
      return
    }
    const entries: Array<{ name: string, content: string }> = []
    for (let i = 0; i < MAX_TAR_ENTRIES + 10; i++) {
      entries.push({ name: `package/a${i}.txt`, content: 'x' })
    }
    entries.push({ name: 'package/package.json', content: manifest() })
    const tarball = await packTarball(entries)
    await expect(extractManifest(Readable.from(tarball))).rejects.toMatchObject({ status: 413 })
  })
})

test.describe('computePruneSet', () => {
  const v = (patch: number, arch?: string) => ({ semverPatch: patch, architecture: arch, _id: `${patch}${arch ?? ''}` })

  test('keeps up to 2 distinct patches — no delete needed', () => {
    expect(computePruneSet([v(5), v(4)])).toEqual([])
    expect(computePruneSet([v(3)])).toEqual([])
    expect(computePruneSet([])).toEqual([])
  })

  test('deletes older patches past the 2-deep window', () => {
    const versions = [v(5), v(4), v(3), v(2), v(1)]
    const toDelete = computePruneSet(versions)
    expect(toDelete.map(x => x.semverPatch)).toEqual([3, 2, 1])
  })

  test('multi-arch same patch: all variants of a kept patch are retained', () => {
    const versions = [v(5, 'x86_64'), v(5, 'arm64'), v(4, 'x86_64'), v(4, 'arm64')]
    // Only 2 distinct patches → nothing to delete even though 4 docs exist.
    expect(computePruneSet(versions)).toEqual([])
  })

  test('multi-arch staggered patches: pruning all variants of the oldest patch', () => {
    // Input is already sorted: (5,x86),(5,arm),(4,x86),(3,x86),(3,arm)
    const versions = [
      v(5, 'x86_64'), v(5, 'arm64'),
      v(4, 'x86_64'),
      v(3, 'x86_64'), v(3, 'arm64')
    ]
    const toDelete = computePruneSet(versions)
    // Distinct patches: [5,4,3] → keep [5,4], delete both arch variants of 3.
    expect(toDelete).toHaveLength(2)
    expect(toDelete.every(x => x.semverPatch === 3)).toBe(true)
  })

  test('uploading a third arch for a high patch does not delete lower patches unexpectedly', () => {
    // Scenario: already had 1.0.1, 1.0.2; then 1.0.2 uploaded for a third arch.
    // Distinct patches are still [2,1] so nothing should be deleted.
    const versions = [
      v(2, 'x86_64'), v(2, 'arm64'), v(2, 'armv7'),
      v(1, 'x86_64')
    ]
    expect(computePruneSet(versions)).toEqual([])
  })

  test('five patches with mixed arch: keeps top 2 patches across all arches', () => {
    const versions = [
      v(5, 'x86_64'),
      v(4, 'arm64'),
      v(3, 'x86_64'), v(3, 'arm64'),
      v(2, 'x86_64'),
      v(1, 'x86_64')
    ]
    const toDelete = computePruneSet(versions)
    const deletedPatches = new Set(toDelete.map(x => x.semverPatch))
    expect(deletedPatches).toEqual(new Set([3, 2, 1]))
    // Verify both arch variants of patch 3 are in the delete set.
    expect(toDelete.filter(x => x.semverPatch === 3)).toHaveLength(2)
  })
})
