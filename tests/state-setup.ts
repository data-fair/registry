import assert from 'node:assert/strict'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { test as setup } from '@playwright/test'

const anonymousAx = axiosBuilder()

setup('Stateful tests setup', async () => {
  await assert.doesNotReject(anonymousAx.get(`http://localhost:${process.env.DEV_API_PORT}/api/ping`),
    `Dev web server seems to be unavailable.
If you are agent do not try to start it. Instead check for a startup failure in "npx --no df-dev logs api -n 100" and report this problem to your user if there is no fixable startup failure in the log (you may try "npx --no df-dev restart api" once).`)
  await assert.doesNotReject(anonymousAx.get(`http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}/simple-directory/`),
    'Simple Directory server seems to be unavailable. If you are agent do not try to fix this, instead check "npx --no df-dev status" and report this problem to your user.')
})
