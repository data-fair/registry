import { test, expect } from '@playwright/test'
import { superAdmin, anonymousAx, clean } from './support/axios.ts'

// Seed an artefact doc directly (no upload → no auto-scan race). See the
// PUT /api/test-env/artefacts/:id/doc route (already implemented).
const seed = async (id: string, doc: Record<string, any>) => {
  await anonymousAx.put(`/api/test-env/artefacts/${encodeURIComponent(id)}/doc`, doc)
}

const sevSummary = (critical: number, high: number, total = critical + high) =>
  ({ critical, high, medium: 0, low: 0, unknown: 0, total })

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
