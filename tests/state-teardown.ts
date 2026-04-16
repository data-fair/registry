import assert from 'node:assert/strict'
import { test as teardown } from '@playwright/test'

teardown('Stateful tests teardown', () => {
  const pid = process.env.TAIL_PID
  assert.ok(pid, 'Tail process PID is not defined')
  try {
    process.kill(parseInt(pid))
  } catch (err: any) {
    if (err.code !== 'ESRCH') throw err
  }
})
