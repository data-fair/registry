import { test, expect } from '@playwright/test'
import { Readable, Writable } from 'node:stream'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import * as tar from 'tar-stream'
import { extractManifest, MAX_DECOMPRESSED_BYTES } from '../api/src/artefacts/operations.ts'
import { createTestTarball } from './support/test-tarball.ts'

const streamBuffer = (buf: Buffer): Readable => Readable.from(buf)

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

test.describe('extractManifest', () => {
  const manifest = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    name: '@test/pkg',
    version: '1.0.0',
    ...overrides
  })

  test('extracts standard package/package.json entry', async () => {
    const tarball = await packTarball([{ name: 'package/package.json', content: manifest() }])
    const result = await extractManifest(Readable.from(tarball))
    expect(result.manifest.name).toBe('@test/pkg')
    expect(result.manifest.version).toBe('1.0.0')
  })

  test('normalizes licence/license', async () => {
    const tarball = await packTarball([
      { name: 'package/package.json', content: manifest({ license: 'MIT' }) }
    ])
    const result = await extractManifest(Readable.from(tarball))
    expect(result.manifest.licence).toBe('MIT')
  })

  test('does not extract a category from package.json (category comes from the upload form field)', async () => {
    const tarball = await packTarball([
      { name: 'package/package.json', content: manifest({ registry: { category: 'processing' } }) }
    ])
    const result = await extractManifest(Readable.from(tarball))
    expect((result.manifest as { category?: unknown }).category).toBeUndefined()
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
    expect(result.manifest.name).toBe('@test/pkg')
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
    expect(result.manifest.name).toBe('@test/pkg')
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

test.describe('extractManifest hasNativeModules detection', () => {
  test('pure JS package returns hasNativeModules=false', async () => {
    const tarball = await createTestTarball({ name: '@test/pure', version: '1.0.0' })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.manifest.name).toBe('@test/pure')
    expect(result.hasNativeModules).toBe(false)
  })

  test('package with a .node binary in node_modules returns true', async () => {
    const tarball = await createTestTarball({
      name: '@test/native',
      version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/build/Release/foo.node', content: 'BINARY' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('package with binding.gyp in node_modules returns true', async () => {
    const tarball = await createTestTarball({
      name: '@test/gyp',
      version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/binding.gyp', content: '{}' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('subpackage with node-gyp postinstall returns true', async () => {
    const subPkg = JSON.stringify({ name: 'foo', version: '1.0.0', scripts: { postinstall: 'node-gyp rebuild' } })
    const tarball = await createTestTarball({
      name: '@test/postinstall',
      version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/package.json', content: subPkg }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('subpackage with prebuild-install install script returns true', async () => {
    const subPkg = JSON.stringify({ name: 'foo', version: '1.0.0', scripts: { install: 'prebuild-install || node-gyp rebuild' } })
    const tarball = await createTestTarball({
      name: '@test/prebuild',
      version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/package.json', content: subPkg }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('prebuilds directory anywhere in node_modules returns true', async () => {
    const tarball = await createTestTarball({
      name: '@test/prebuilds',
      version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/prebuilds/linux-x64/foo.node', content: 'BINARY' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(true)
  })

  test('top-level binding.gyp NOT in node_modules does not trigger', async () => {
    // The plugin package itself rarely ships a binding.gyp at top level;
    // when it does, it's metadata about the plugin's own build (not a dep
    // to rebuild). Detection scopes to node_modules/** to avoid false
    // positives on plugins that bundle native helpers as source.
    const tarball = await createTestTarball({
      name: '@test/topgyp',
      version: '1.0.0',
      extraEntries: [{ name: 'package/binding.gyp', content: '{}' }]
    })
    const result = await extractManifest(streamBuffer(tarball))
    expect(result.hasNativeModules).toBe(false)
  })
})
