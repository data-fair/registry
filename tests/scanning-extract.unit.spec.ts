import { test, expect } from '@playwright/test'
import { Readable } from 'node:stream'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestTarball } from './support/test-tarball.ts'
import { extractTarballToDir } from '../api/src/scanning/extract.ts'

test.describe('scanning extract', () => {
  test('extracts a gzipped tarball to disk preserving the package/ layout', async () => {
    const buf = await createTestTarball({
      name: '@test/pkg',
      version: '1.0.0',
      extraEntries: [{ name: 'package/node_modules/foo/package.json', content: '{"name":"foo","version":"1.2.3"}' }]
    })
    const dir = await mkdtemp(join(tmpdir(), 'scan-test-'))
    try {
      await extractTarballToDir(Readable.from(buf), dir, { maxEntries: 1000 })
      const top = JSON.parse(await readFile(join(dir, 'package', 'package.json'), 'utf-8'))
      expect(top.name).toBe('@test/pkg')
      const dep = JSON.parse(await readFile(join(dir, 'package', 'node_modules', 'foo', 'package.json'), 'utf-8'))
      expect(dep.version).toBe('1.2.3')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('rejects a tarball exceeding the entry cap', async () => {
    const extraEntries = Array.from({ length: 50 }, (_, i) => ({ name: `package/f${i}.txt`, content: 'x' }))
    const buf = await createTestTarball({ name: '@test/big', version: '1.0.0', extraEntries })
    const dir = await mkdtemp(join(tmpdir(), 'scan-test-'))
    try {
      await expect(extractTarballToDir(Readable.from(buf), dir, { maxEntries: 10 })).rejects.toThrow(/entries/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
