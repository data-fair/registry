import { test, expect } from '@playwright/test'
import { Readable } from 'node:stream'
import { mkdtemp, rm, readFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestTarball } from './support/test-tarball.ts'
import { ensureExtracted, pruneExtracted } from '../api/src/scanning/cache.ts'

test.describe('scanning cache', () => {
  test('cold miss extracts + writes meta; same path is a hit (openTarball not re-called)', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'scan-cache-'))
    try {
      const buf = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      let opens = 0
      const openTarball = async () => { opens++; return Readable.from(buf) }
      const ref = { artefactId: '@test/pkg@1', path: 'npm/@test/pkg@1/aaa.tgz', dataUpdatedAt: 'D1' }

      const dir1 = await ensureExtracted(ref, cacheDir, openTarball, 1000)
      expect(opens).toBe(1)
      const top = JSON.parse(await readFile(join(dir1, 'package', 'package.json'), 'utf-8'))
      expect(top.name).toBe('@test/pkg')
      const meta = JSON.parse(await readFile(join(dir1, '.meta.json'), 'utf-8'))
      expect(meta.path).toBe(ref.path)

      const dir2 = await ensureExtracted(ref, cacheDir, openTarball, 1000)
      expect(dir2).toBe(dir1)
      expect(opens).toBe(1) // HIT: tarball not re-opened
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  test('changed path re-extracts the new content', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'scan-cache-'))
    try {
      let opens = 0
      const open1 = async () => { opens++; return Readable.from(await createTestTarball({ name: '@test/pkg', version: '1.0.0' })) }
      const open2 = async () => { opens++; return Readable.from(await createTestTarball({ name: '@test/pkg', version: '2.0.0' })) }
      await ensureExtracted({ artefactId: '@test/pkg@1', path: 'p/aaa.tgz' }, cacheDir, open1, 1000)
      const dir = await ensureExtracted({ artefactId: '@test/pkg@1', path: 'p/bbb.tgz' }, cacheDir, open2, 1000)
      expect(opens).toBe(2)
      const top = JSON.parse(await readFile(join(dir, 'package', 'package.json'), 'utf-8'))
      expect(top.version).toBe('2.0.0')
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  test('pruneExtracted removes stale slots, keeps valid, ignores .tmp. dirs', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'scan-cache-'))
    try {
      const keep = encodeURIComponent('@test/keep@1')
      const stale = encodeURIComponent('@test/stale@1')
      await mkdir(join(cacheDir, keep), { recursive: true })
      await mkdir(join(cacheDir, stale), { recursive: true })
      await mkdir(join(cacheDir, `${keep}.tmp.123`), { recursive: true })

      await pruneExtracted(cacheDir, new Set(['@test/keep@1']))

      const left = await readdir(cacheDir)
      expect(left).toContain(keep)
      expect(left).not.toContain(stale)
      expect(left).toContain(`${keep}.tmp.123`) // in-flight dirs are left alone
    } finally {
      await rm(cacheDir, { recursive: true, force: true })
    }
  })

  test('pruneExtracted on a missing cache dir is a no-op', async () => {
    await expect(
      pruneExtracted(join(tmpdir(), 'scan-cache-does-not-exist-xyz'), new Set())
    ).resolves.toBeUndefined()
  })
})
