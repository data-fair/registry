import { test, expect } from '@playwright/test'
import { anonymousAx } from './support/axios.ts'

test.describe('Ping', () => {
  test('should respond ok', async () => {
    const res = await anonymousAx.get('/api/ping')
    expect(res.data).toBe('ok')
  })
})
