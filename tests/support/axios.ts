import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { axiosAuth as _axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import { prefix } from './sd-fixtures.ts'

export const directoryUrl = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}/simple-directory`
// the session cookies of simple-directory are set on DEV_HOST: authenticated calls reach the API on that
// host too (cookies ignore the port), not on localhost
export const baseURL = `http://${process.env.DEV_HOST}:${process.env.DEV_API_PORT}`

// API tests address the server directly on DEV_API_PORT: nothing sits in front of it to set X-Forwarded-For,
// which the server needs for the IP binding simple-directory stamps into admin sessions (a superadmin's token
// carries the IP it logged in from, and a missing header rejects the request). The test client stands in for
// the reverse proxy: 127.0.0.1 is the address simple-directory records at login, reached through nginx on loopback.
export const proxyHeaders = { 'x-forwarded-for': '127.0.0.1' }

const axiosOpts = { baseURL, headers: proxyHeaders }

export const axios = (opts = {}) => axiosBuilder({ ...axiosOpts, ...opts })
export const anonymousAx = axios()

export const axiosAuth = (user: string, opts?: { adminMode?: boolean, org?: string, baseURL?: string }) => {
  return _axiosAuth({
    email: user + '@test.com',
    password: 'passwd',
    adminMode: opts?.adminMode,
    org: opts?.org,
    axiosOpts: opts?.baseURL ? { baseURL: opts.baseURL, headers: proxyHeaders } : axiosOpts,
    directoryUrl
  })
}

export const superAdmin = axiosAuth('test_registry_superadmin', { adminMode: true })

export const axiosWithApiKey = (key: string) => axiosBuilder({ ...axiosOpts, headers: { ...proxyHeaders, 'x-api-key': key } })

export const axiosInternal = (secret: string) => axiosBuilder({ ...axiosOpts, headers: { ...proxyHeaders, 'x-secret-key': secret } })

// what the test sub-space owns here (accounts test_registry_*) and the global objects it names with the
// prefix: artefacts `@test_registry_…` or `test_registry_…`, remote registries named `test_registry_…`
export const clean = async () => {
  await anonymousAx.delete(`http://localhost:${process.env.DEV_API_PORT}/api/test-env`, { params: { prefix } })
}

export const setArtefactOrigin = async (artefactId: string, origin: string) => {
  await anonymousAx.put(`http://localhost:${process.env.DEV_API_PORT}/api/test-env/artefacts/${encodeURIComponent(artefactId)}/origin`, { origin })
}

const testEnvUrl = `http://localhost:${process.env.DEV_API_PORT}/api/test-env`

// The lock id embeds the registry url, so it must be encoded as a single path segment.
const syncLockPath = (registryId: string) => `${testEnvUrl}/locks/${encodeURIComponent('sync-remote-' + registryId)}`

export const holdSyncLock = async (registryId: string) => {
  await anonymousAx.put(syncLockPath(registryId), {})
}

export const releaseSyncLock = async (registryId: string) => {
  await anonymousAx.delete(syncLockPath(registryId))
}

export const syncLockExists = async (registryId: string): Promise<boolean> => {
  const res = await anonymousAx.get(syncLockPath(registryId))
  return res.data.exists
}

// Selecting an artefact starts a background sync of it. Tests that then depend on
// the lock (a manual sync, a held-lock assertion) or on the mirrored copy must
// wait for that sync — and any queued follow-up — to settle first.
export const waitSyncIdle = async (registryId: string) => {
  const admin = await superAdmin
  for (let i = 0; i < 100; i++) {
    const res = await admin.get('/api/v1/remote-registries/' + encodeURIComponent(registryId))
    if (res.data.syncState !== 'running' && !res.data.pendingSync?.length) return res.data
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('sync did not settle within 10s')
}

// --- federation upstream --------------------------------------------------
// A second registry process (npm run dev:api-upstream), used as a mirror source. See
// AGENTS.md "Exercising federation sync".
//
// Resolved lazily: this module is imported by every spec, and most of them
// never touch the upstream. A module-level throw would break them all.

const upstreamPort = (): string => {
  const port = process.env.DEV_UPSTREAM_API_PORT
  if (!port) {
    throw new Error('DEV_UPSTREAM_API_PORT is not set — add it to .env (see dev/default.env)')
  }
  return port
}

// the upstream's id as a remote registry: the downstream API calls it server to server
export const upstreamBaseURL = () => `http://localhost:${upstreamPort()}`
// session calls go to DEV_HOST, where the session cookies are set (see baseURL)
const upstreamSessionURL = () => `http://${process.env.DEV_HOST}:${upstreamPort()}`

export const upstreamSuperAdmin = () => axiosAuth('test_registry_superadmin', { adminMode: true, baseURL: upstreamSessionURL() })

export const upstreamAxiosAuth = (user: string, opts?: { org?: string }) =>
  axiosAuth(user, { ...opts, baseURL: upstreamSessionURL() })

export const upstreamAxiosWithApiKey = (key: string) =>
  axiosBuilder({ baseURL: upstreamBaseURL(), headers: { ...proxyHeaders, 'x-api-key': key } })

// The upstream also runs NODE_ENV=development, so its test-env router is
// mounted, and a request from localhost is internal.
export const cleanUpstream = async () => {
  await anonymousAx.delete(`${upstreamBaseURL()}/api/test-env`, { params: { prefix } })
}
