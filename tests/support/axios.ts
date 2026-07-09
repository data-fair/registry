import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { axiosAuth as _axiosAuth } from '@data-fair/lib-node/axios-auth.js'

export const directoryUrl = `http://localhost:${process.env.NGINX_PORT}/simple-directory`
export const baseURL = `http://localhost:${process.env.DEV_API_PORT}`

const axiosOpts = { baseURL }

export const axios = (opts = {}) => axiosBuilder({ ...axiosOpts, ...opts })
export const anonymousAx = axios()

export const axiosAuth = (user: string, opts?: { adminMode?: boolean, org?: string }) => {
  return _axiosAuth({ email: user + '@test.com', password: 'passwd', adminMode: opts?.adminMode, org: opts?.org, axiosOpts, directoryUrl })
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
