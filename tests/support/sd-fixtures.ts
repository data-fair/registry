import { readFileSync } from 'node:fs'

/**
 * The accounts of this service's test sub-space in simple-directory: every user, organization and member
 * id (and every email) starts with the prefix, so the suite seeds and cleans them without touching the
 * accounts of other sub-spaces (dev data under another prefix, other suites).
 *
 * Upserted by tests/global-setup.ts through simple-directory's test API (POST /api/test-env/seed) before
 * the spec files are loaded (never for a unit-only run), then cleaned (DELETE /api/test-env?prefix=) and
 * seeded again by tests/state-setup.ts, under the stateful lock. Every user uses the password 'passwd' and
 * the email `<id>@test.com`, which is what the login helpers derive (tests/support/axios.ts).
 */
export const prefix = 'test_registry_'

const person = (id: string) => ({ id: prefix + id, email: `${prefix}${id}@test.com`, password: { clear: 'passwd' } })

// the non human identity of the scope tests (tests/support/nhi.ts), its public key inline
const nhiJwks = JSON.parse(readFileSync(new URL('../resources/nhi/test-nhi-jwks.json', import.meta.url), 'utf8'))

export const sdFixtures = () => {
  const users = [
    // a simple-directory admin (ADMINS in docker-compose.yml)
    person('superadmin'),
    person('standalone1'),
    person('standalone2'),
    person('org1_admin'),
    person('org1_contrib'),
    person('org1_user'),
    {
      id: `${prefix}org1_scope_nhi`,
      email: `${prefix}org1_scope_nhi@test.com`,
      nhi: { provider: { issuer: 'https://registry-tests.example.com', jwks: nhiJwks }, subject: 'scope-tests' }
    }
  ]

  const organizations = [
    {
      id: `${prefix}org1`,
      name: 'Registry Test Organization 1',
      members: [
        { id: `${prefix}org1_admin`, role: 'admin' },
        { id: `${prefix}org1_contrib`, role: 'contrib' },
        { id: `${prefix}org1_user`, role: 'user' },
        { id: `${prefix}org1_scope_nhi`, role: 'admin' }
      ]
    }
  ]

  return { prefix, users, organizations }
}

/** simple-directory's test API, reached directly (not through nginx) */
export const sdTestEnvUrl = (env: Record<string, string | undefined> = process.env) => `http://localhost:${env.SD_PORT}/api/test-env`

const tooOld = 'simple-directory image too old for prefixed test sub-spaces: run "docker compose pull simple-directory"'

/**
 * POST a sub-space body to simple-directory's seed route and check the counts of the answer: an old image
 * without the prefixed test API answers 200 too, after seeding its own files, and the run would fail later with 401s.
 */
export const postSdSeed = async (url: string, body: { prefix: string, users: unknown[], organizations: unknown[] }) => {
  const seedRes = await fetch(`${url}/seed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (seedRes.status >= 500) throw new Error(`${tooOld} (HTTP ${seedRes.status} on the seed of ${body.prefix})`)
  if (seedRes.status !== 200) throw new Error(`simple-directory refused the seed of ${body.prefix}: HTTP ${seedRes.status} ${await seedRes.text()}`)
  const counts = await seedRes.json().catch(() => null) as { users: number, organizations: number } | null
  if (counts?.users !== body.users.length || counts?.organizations !== body.organizations.length) {
    throw new Error(tooOld)
  }
  return counts
}

/** Clean the sub-space in simple-directory, then seed its accounts. Idempotent. */
export const seedSdFixtures = async () => {
  const url = sdTestEnvUrl()
  const cleanRes = await fetch(`${url}?prefix=${prefix}`, { method: 'DELETE' })
  if (cleanRes.status !== 204) throw new Error(`simple-directory refused the cleanup of ${prefix}: HTTP ${cleanRes.status} ${await cleanRes.text()}`)
  return await postSdSeed(url, sdFixtures())
}
