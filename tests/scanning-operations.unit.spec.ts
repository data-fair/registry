import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mapOsvOutput, severityBucket, summarize } from '../api/src/scanning/operations.ts'

test.describe('scanning operations', () => {
  test('severityBucket maps labels and CVSS scores', () => {
    expect(severityBucket('CRITICAL', undefined)).toBe('critical')
    expect(severityBucket('HIGH', undefined)).toBe('high')
    expect(severityBucket('MODERATE', undefined)).toBe('medium')
    expect(severityBucket('LOW', undefined)).toBe('low')
    expect(severityBucket(undefined, '9.8')).toBe('critical')
    expect(severityBucket(undefined, '7.5')).toBe('high')
    expect(severityBucket(undefined, '5.0')).toBe('medium')
    expect(severityBucket(undefined, '2.0')).toBe('low')
    expect(severityBucket(undefined, undefined)).toBe('unknown')
  })

  test('summarize counts findings by severity', () => {
    const summary = summarize([
      { id: 'a', pkgName: 'x', installedVersion: '1', severity: 'high' },
      { id: 'b', pkgName: 'y', installedVersion: '1', severity: 'high' },
      { id: 'c', pkgName: 'z', installedVersion: '1', severity: 'low' }
    ] as any)
    expect(summary).toEqual({ critical: 0, high: 2, medium: 0, low: 1, unknown: 0, total: 3 })
  })

  test('mapOsvOutput extracts the bundled minimist vulnerability from the fixture', () => {
    const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, 'resources/osv-sample-output.json'), 'utf-8'))
    const { vulnerabilities, summary } = mapOsvOutput(raw)
    const m = vulnerabilities.find(v => v.pkgName === 'minimist')
    expect(m).toBeTruthy()
    expect(m!.installedVersion).toBe('0.0.8')
    expect(['critical', 'high', 'medium', 'low', 'unknown']).toContain(m!.severity)
    expect(typeof m!.id).toBe('string')
    expect(summary.total).toBeGreaterThanOrEqual(1)
  })

  test('mapOsvOutput tolerates empty results', () => {
    expect(mapOsvOutput({ results: [] }).vulnerabilities).toEqual([])
    expect(mapOsvOutput({}).vulnerabilities).toEqual([])
  })

  test('detectInstallScripts flags lifecycle install hooks', async () => {
    const { detectInstallScripts } = await import('../api/src/scanning/operations.ts')
    expect(detectInstallScripts({ scripts: { postinstall: 'node x.js' } })).toBe(true)
    expect(detectInstallScripts({ scripts: { preinstall: 'sh y.sh' } })).toBe(true)
    expect(detectInstallScripts({ scripts: { install: 'make' } })).toBe(true)
    expect(detectInstallScripts({ scripts: { build: 'tsc', test: 'x' } })).toBe(false)
    expect(detectInstallScripts({})).toBe(false)
    expect(detectInstallScripts(null)).toBe(false)
    expect(detectInstallScripts('not an object')).toBe(false)
  })
})
