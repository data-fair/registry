import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { axiosAuth as _axiosAuth } from '@data-fair/lib-node/axios-auth.js'

export const directoryUrl = `http://localhost:${process.env.NGINX_PORT}/simple-directory`
export const baseURL = `http://localhost:${process.env.DEV_API_PORT}`

const axiosOpts = { baseURL }

export const axios = (opts = {}) => axiosBuilder({ ...axiosOpts, ...opts })
export const anonymousAx = axios()

export const axiosAuth = (user: string, opts?: { adminMode?: boolean, org?: string, baseURL?: string }) => {
  return _axiosAuth({
    email: user + '@test.com',
    password: 'passwd',
    adminMode: opts?.adminMode,
    org: opts?.org,
    axiosOpts: opts?.baseURL ? { baseURL: opts.baseURL } : axiosOpts,
    directoryUrl
  })
}

export const superAdmin = axiosAuth('superadmin', { adminMode: true })

export const axiosWithApiKey = (key: string) => axiosBuilder({ ...axiosOpts, headers: { 'x-api-key': key } })

export const axiosInternal = (secret: string) => axiosBuilder({ ...axiosOpts, headers: { 'x-secret-key': secret } })

export const clean = async () => {
  await anonymousAx.delete(`http://localhost:${process.env.DEV_API_PORT}/api/test-env`)
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

// --- federation upstream --------------------------------------------------
// A second registry process, used as a mirror source. See
// docs/superpowers/specs/2026-07-10-federation-dev-testing-design.md
//
// Resolved lazily: this module is imported by every spec, and most of them
// never touch the upstream. A module-level throw would break them all.

const upstreamPort = (): string => {
  const port = process.env.DEV_UPSTREAM_API_PORT
  if (!port) {
    throw new Error('DEV_UPSTREAM_API_PORT is not set — append it to .env (DEV_API_PORT + 5), do not re-run dev/init-env.sh')
  }
  return port
}

export const upstreamBaseURL = () => `http://localhost:${upstreamPort()}`

export const upstreamSuperAdmin = () => axiosAuth('superadmin', { adminMode: true, baseURL: upstreamBaseURL() })

export const upstreamAxiosAuth = (user: string, opts?: { org?: string }) =>
  axiosAuth(user, { ...opts, baseURL: upstreamBaseURL() })

export const upstreamAxiosWithApiKey = (key: string) =>
  axiosBuilder({ baseURL: upstreamBaseURL(), headers: { 'x-api-key': key } })

// The upstream also runs NODE_ENV=development, so its test-env router is
// mounted, and a request from localhost is internal.
export const cleanUpstream = async () => {
  await anonymousAx.delete(`${upstreamBaseURL()}/api/test-env`)
}
