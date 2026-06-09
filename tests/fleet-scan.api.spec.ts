import { test, expect } from '@playwright/test'
import { superAdmin, anonymousAx, clean } from './support/axios.ts'

// Seed an artefact doc directly (no upload → no auto-scan race). See the
// PUT /api/test-env/artefacts/:id/doc route (already implemented).
const seed = async (id: string, doc: Record<string, any>) => {
  await anonymousAx.put(`/api/test-env/artefacts/${encodeURIComponent(id)}/doc`, doc)
}

const sevSummary = (critical: number, high: number, total = critical + high) =>
  ({ critical, high, medium: 0, low: 0, unknown: 0, total })

test.describe('Fleet scan — summary endpoint', () => {
  test.beforeEach(async () => { await clean() })

  test('aggregates totals, health and worst offenders for an admin', async () => {
    await seed('@t/a@1', { scan: { status: 'success', finishedAt: '2026-06-01T00:00:00.000Z', summary: sevSummary(2, 1) } })
    await seed('@t/b@1', { scan: { status: 'success', finishedAt: '2026-06-05T00:00:00.000Z', summary: sevSummary(0, 3) } })
    await seed('@t/err@1', { scan: { status: 'error', finishedAt: '2026-06-05T00:00:00.000Z', error: 'boom' } })
    await seed('@t/never@1', {}) // npm, no scan field
    // a FILE artefact with a scary scan must be ignored (summary is npm-only)
    await seed('@t/file', { format: 'file', scan: { status: 'success', summary: sevSummary(9, 9) } })

    const admin = await superAdmin
    const res = await admin.get('/api/v1/artefacts/scan-summary')

    expect(typeof res.data.enabled).toBe('boolean')
    expect(res.data.totals.critical).toBe(2)
    expect(res.data.totals.high).toBe(4)
    expect(res.data.totals.artefactsWithCritical).toBe(1)
    expect(res.data.health.npmTotal).toBe(4)
    expect(res.data.health.scanned).toBe(2)
    expect(res.data.health.error).toBe(1)
    expect(res.data.health.never).toBe(1)
    expect(res.data.health.oldestScanAt).toBe('2026-06-01T00:00:00.000Z')
    expect(res.data.worstOffenders[0]._id).toBe('@t/a@1')
    expect(res.data.worstOffenders.map((o: any) => o._id)).not.toContain('@t/file')
  })

  test('scan-summary rejects a non-admin caller', async () => {
    try {
      await anonymousAx.get('/api/v1/artefacts/scan-summary')
      expect(true).toBe(false)
    } catch (err: any) {
      expect([401, 403]).toContain(err.status)
    }
  })
})

test.describe('Fleet scan — list sort', () => {
  test.beforeEach(async () => { await clean() })

  test('sort=vulnerabilities orders by criticals for an admin', async () => {
    await seed('@t/low@1', { public: true, scan: { status: 'success', summary: sevSummary(0, 1) } })
    await seed('@t/high@1', { public: true, scan: { status: 'success', summary: sevSummary(3, 0) } })
    await seed('@t/none@1', { public: true })

    const admin = await superAdmin
    const res = await admin.get('/api/v1/artefacts?sort=vulnerabilities&size=100')
    const ids: string[] = res.data.results.map((r: any) => r._id)
    expect(ids.indexOf('@t/high@1')).toBeLessThan(ids.indexOf('@t/low@1'))
    // unscanned artefact sorts last among the three
    expect(ids.indexOf('@t/none@1')).toBeGreaterThan(ids.indexOf('@t/low@1'))
  })

  test('sort=vulnerabilities is ignored for non-admin and never leaks scan data', async () => {
    await seed('@t/low@1', { public: true, scan: { status: 'success', summary: sevSummary(0, 1) } })
    await seed('@t/high@1', { public: true, scan: { status: 'success', summary: sevSummary(3, 0) } })

    const res = await anonymousAx.get('/api/v1/artefacts?sort=vulnerabilities&size=100')
    expect(res.status).toBe(200)
    for (const r of res.data.results) expect(r.scan).toBeUndefined()
  })
})
