import assert from 'node:assert/strict'
import { spawn } from 'child_process'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { test as setup } from '@playwright/test'

const anonymousAx = axiosBuilder()

setup('Stateful tests setup', async () => {
  await assert.doesNotReject(anonymousAx.get(`http://localhost:${process.env.DEV_API_PORT}/api/ping`),
    `Dev web server seems to be unavailable.
If you are agent do not try to start it. Instead check for a startup failure at the end of dev/logs/dev-api.log and report this problem to your user if there is no fixable startup failure in the log.`)
  await assert.doesNotReject(anonymousAx.get(`http://localhost:${process.env.NGINX_PORT}/simple-directory`),
    'Simple Directory server seems to be unavailable. If you are agent do not try to fix this, instead report this problem to your user.')

  const tail = spawn('tail', ['-n', '0', '-f', 'dev/logs/dev-api.log'], { stdio: 'inherit', detached: true })
  process.env.TAIL_PID = tail.pid?.toString()
})
