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
