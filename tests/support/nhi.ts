import type { AxiosInstance } from 'axios'
import { readFileSync } from 'node:fs'
import { importPKCS8, SignJWT } from 'jose'
import { axiosBuilder } from '@data-fair/lib-node/axios.js'
import { baseURL, directoryUrl } from './axios.ts'

// the non human identity of dev/resources/users.json, admin of org test1
export const scopeNhiId = 'test1_scope_nhi'
const issuer = 'https://registry-tests.example.com'
const subject = 'scope-tests'
// the site origin simple-directory sees (reqSiteUrl), the assertion audience
const audience = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}`

let privateKey: Awaited<ReturnType<typeof importPKCS8>> | undefined
const getPrivateKey = async () => {
  privateKey ??= await importPKCS8(
    readFileSync(new URL('../resources/nhi/test-nhi-key.pem', import.meta.url), 'utf8'),
    'RS256'
  )
  return privateKey
}

/**
 * Exchange an assertion of the test NHI for a session limited to the requested scope
 * (no scope: an unrestricted session). Returns an axios authenticated by the session cookies
 * and one authenticated by the bearer access token, both targeting the registry API.
 */
export const nhiSession = async (scope?: string): Promise<{ cookieAx: AxiosInstance, bearerAx: AxiosInstance, accessToken: string }> => {
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test-nhi-key' })
    .setIssuer(issuer)
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(await getPrivateKey())
  const res = await axiosBuilder().post(`${directoryUrl}/api/auth/nhi-token`, { client_id: scopeNhiId, assertion, ...(scope ? { scope } : {}) })
  const accessToken: string = res.data.access_token
  const cookie = (res.headers['set-cookie'] ?? []).map((c: string) => c.split(';')[0]).join('; ')
  return {
    cookieAx: axiosBuilder({ baseURL, headers: { cookie } }),
    // through nginx: the audience of a bearer is the site it is used on (x-forwarded-host), a direct
    // call to the API port has none and is refused
    bearerAx: axiosBuilder({ baseURL: `${audience}/registry`, headers: { authorization: `Bearer ${accessToken}` } }),
    accessToken
  }
}
