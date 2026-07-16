// Seeds the dev stack with representative fixtures: API keys, npm artefacts,
// file artefacts, thumbnails, and access grants. Idempotent — re-running skips
// anything already present. Requires the dev API to be running.
//
// Run: npm run dev:fixtures

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import FormData from 'form-data'
import {
  superAdmin, axiosWithApiKey, baseURL, axios as axiosFactory,
  upstreamBaseURL, upstreamSuperAdmin, upstreamAxiosAuth, upstreamAxiosWithApiKey
} from '../tests/support/axios.ts'
import { createTestTarball } from '../tests/support/test-tarball.ts'

const OUTPUT_PATH = join(import.meta.dirname, 'fixtures-output.json')

// 2x2 PNG (red). Base64 is short and sharp decodes it fine.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAF0lEQVQIW2P8z8Dwn4EIwDiqEL+KYSQKAH0eBPuxMUosAAAAAElFTkSuQmCC',
  'base64'
)

type OutputFile = { keys: Record<string, string> }

const loadOutput = async (): Promise<OutputFile> => {
  if (!existsSync(OUTPUT_PATH)) return { keys: {} }
  try {
    return JSON.parse(await readFile(OUTPUT_PATH, 'utf-8'))
  } catch {
    return { keys: {} }
  }
}

const saveOutput = async (out: OutputFile) => {
  await writeFile(OUTPUT_PATH, JSON.stringify(out, null, 2) + '\n')
}

const isHttp404 = (err: any) => err?.response?.status === 404 || err?.status === 404
const isHttp409 = (err: any) => err?.response?.status === 409 || err?.status === 409

const anonymousPing = async (url: string) => {
  await axiosFactory({ baseURL: url }).get('/api/ping')
}

async function main () {
  console.log(`→ Connecting to ${baseURL}`)
  const admin = await superAdmin
  const output = await loadOutput()

  // --- API keys -----------------------------------------------------------
  const keySpecs: { name: string, body: Record<string, unknown> }[] = [
    { name: 'dev-upload-unrestricted', body: { type: 'upload', name: 'dev-upload-unrestricted' } },
    { name: 'dev-upload-terrain', body: { type: 'upload', name: 'dev-upload-terrain', allowedNamePrefix: 'terrain-' } }
  ]

  // Upload keys carry no `owner`, so the list endpoint only returns them
  // when explicitly filtered by type — without this the idempotency check
  // below never matches and re-runs create duplicate keys.
  const existingKeys = await admin.get('/api/v1/api-keys?type=upload')
  const existingKeyNames = new Set<string>(existingKeys.data.results.map((k: any) => k.name))

  for (const spec of keySpecs) {
    if (existingKeyNames.has(spec.name) && output.keys[spec.name]) {
      console.log(`  ✓ api-key ${spec.name} (skipped)`)
      continue
    }
    if (existingKeyNames.has(spec.name) && !output.keys[spec.name]) {
      console.log(`  ! api-key ${spec.name} exists in DB but raw key is lost — leave it, skipping`)
      continue
    }
    const res = await admin.post('/api/v1/api-keys', spec.body)
    output.keys[spec.name] = res.data.key
    console.log(`  + api-key ${spec.name}`)
  }
  await saveOutput(output)

  const uploadKey = output.keys['dev-upload-unrestricted']
  if (!uploadKey) {
    throw new Error('dev-upload-unrestricted key missing from output; delete fixtures-output.json and re-run on a clean DB')
  }
  const upload = axiosWithApiKey(uploadKey)

  // --- Helpers ------------------------------------------------------------
  const artefactExists = async (id: string) => {
    try {
      await admin.get(`/api/v1/artefacts/${encodeURIComponent(id)}`)
      return true
    } catch (err) {
      if (isHttp404(err)) return false
      throw err
    }
  }

  const getArtefact = async (id: string) => {
    const res = await admin.get(`/api/v1/artefacts/${encodeURIComponent(id)}`)
    return res.data
  }

  // --- npm artefacts ------------------------------------------------------
  // In the unified model each artefact id is one major line; uploading to
  // /npm/:id stores a single tarball (the `noarch` slot). The category is
  // taken from the multipart form field, never from the package manifest.
  const npmSpecs: { name: string, category: string, version: string }[] = [
    { name: '@koumoul/processing-hello', category: 'processing', version: '1.1.0' },
    { name: '@koumoul/application-demo', category: 'application', version: '1.0.0' },
    { name: '@test/catalog-sample', category: 'catalog', version: '2.0.0' }
  ]

  for (const spec of npmSpecs) {
    const major = spec.version.split('.')[0]
    const id = `${spec.name}@${major}`
    if (await artefactExists(id)) {
      console.log(`  ✓ npm ${id} (skipped)`)
      continue
    }
    const tarball = await createTestTarball({ name: spec.name, version: spec.version, licence: 'MIT' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    form.append('category', spec.category)
    await upload.post(
      `/api/v1/artefacts/npm/${encodeURIComponent(id)}`,
      form,
      { headers: form.getHeaders() }
    )
    console.log(`  + npm ${id}`)
  }

  // --- File artefacts -----------------------------------------------------
  const fileSpecs: { name: string, category: string, fileName: string, content: string }[] = [
    { name: 'terrain-france', category: 'tileset', fileName: 'terrain-france.mbtiles', content: 'dummy-mbtiles-content' },
    { name: 'basemap-style', category: 'maplibre-style', fileName: 'basemap.json', content: '{"version":8,"sources":{},"layers":[]}' },
    { name: 'sample-other', category: 'other', fileName: 'sample.bin', content: 'dummy-other-content' }
  ]

  for (const spec of fileSpecs) {
    if (await artefactExists(spec.name)) {
      console.log(`  ✓ file ${spec.name} (skipped)`)
      continue
    }
    const form = new FormData()
    form.append('file', Buffer.from(spec.content), { filename: spec.fileName, contentType: 'application/octet-stream' })
    form.append('category', spec.category)
    form.append('title', JSON.stringify({ fr: `Titre ${spec.name}`, en: `Title ${spec.name}` }))
    form.append('description', JSON.stringify({ fr: `Description de ${spec.name}`, en: `Description of ${spec.name}` }))
    await upload.post(`/api/v1/artefacts/file/${encodeURIComponent(spec.name)}`, form, { headers: form.getHeaders() })
    console.log(`  + file ${spec.name}`)
  }

  // --- Metadata PATCHes ---------------------------------------------------
  const patches: { id: string, body: Record<string, unknown> }[] = [
    {
      id: '@koumoul/processing-hello@1',
      body: {
        public: true,
        title: { fr: 'Processing Hello', en: 'Processing Hello' },
        description: { fr: 'Un processing de démonstration', en: 'A demo processing plugin' }
      }
    },
    {
      id: '@koumoul/application-demo@1',
      body: {
        privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }],
        title: { fr: 'Application de démo', en: 'Demo application' }
      }
    },
    {
      id: '@test/catalog-sample@2',
      body: {
        title: { fr: 'Catalogue exemple', en: 'Sample catalog' }
      }
    },
    {
      id: 'terrain-france',
      body: { public: true }
    },
    {
      id: 'basemap-style',
      body: { privateAccess: [{ type: 'organization', id: 'test1', name: 'test1' }] }
    }
  ]

  for (const patch of patches) {
    await admin.patch(`/api/v1/artefacts/${encodeURIComponent(patch.id)}`, patch.body)
    console.log(`  ~ patched ${patch.id}`)
  }

  // --- Thumbnails ---------------------------------------------------------
  const thumbnailTargets = ['@koumoul/processing-hello@1', 'terrain-france']
  for (const id of thumbnailTargets) {
    const existing = await getArtefact(id)
    if (existing.thumbnail) {
      console.log(`  ✓ thumbnail ${id} (skipped)`)
      continue
    }
    const form = new FormData()
    form.append('file', TINY_PNG, { filename: 'thumb.png', contentType: 'image/png' })
    await admin.post(`/api/v1/artefacts/${encodeURIComponent(id)}/thumbnail`, form, { headers: form.getHeaders() })
    console.log(`  + thumbnail ${id}`)
  }

  // --- Access grants ------------------------------------------------------
  const grantTargets: { type: string, id: string }[] = [
    { type: 'organization', id: 'test1' }
  ]
  for (const account of grantTargets) {
    try {
      await admin.post('/api/v1/access-grants', { account })
      console.log(`  + access-grant ${account.type}:${account.id}`)
    } catch (err) {
      if (isHttp409(err)) {
        console.log(`  ✓ access-grant ${account.type}:${account.id} (skipped)`)
      } else {
        throw err
      }
    }
  }

  // --- Federation upstream ------------------------------------------------
  // Sync mirrors artefacts *from* an upstream registry, so exercising it needs a
  // second registry. Requires the `api-upstream` process (npm run dev-api-upstream);
  // hard-fails if it is down, since that pane is part of the standard dev layout.
  const upstreamUrl = upstreamBaseURL()
  console.log(`\n→ Upstream registry ${upstreamUrl}`)
  try {
    await anonymousPing(upstreamUrl)
  } catch {
    throw new Error(
      `upstream registry not reachable at ${upstreamUrl} — is the \`api-upstream\` zellij pane running? (npm run dev-api-upstream)`
    )
  }

  const upstreamAdmin = await upstreamSuperAdmin()

  const upstreamKeys = await upstreamAdmin.get('/api/v1/api-keys?type=upload')
  const upstreamKeyNames = new Set<string>(upstreamKeys.data.results.map((k: any) => k.name))
  if (upstreamKeyNames.has('dev-upstream-upload') && output.keys['dev-upstream-upload']) {
    console.log('  ✓ upstream api-key dev-upstream-upload (skipped)')
  } else if (upstreamKeyNames.has('dev-upstream-upload')) {
    throw new Error('upstream upload key exists but its raw value is lost — wipe the upstream db and re-run')
  } else {
    const res = await upstreamAdmin.post('/api/v1/api-keys', { type: 'upload', name: 'dev-upstream-upload' })
    output.keys['dev-upstream-upload'] = res.data.key
    console.log('  + upstream api-key dev-upstream-upload')
    await saveOutput(output)
  }
  const upstreamUpload = upstreamAxiosWithApiKey(output.keys['dev-upstream-upload'])

  const upstreamArtefactExists = async (id: string) => {
    try {
      await upstreamAdmin.get(`/api/v1/artefacts/${encodeURIComponent(id)}`)
      return true
    } catch (err) {
      if (isHttp404(err)) return false
      throw err
    }
  }

  // Ids deliberately disjoint from the local fixtures above: selecting an id that
  // already exists locally without an `origin` is rejected with 409.
  const UPSTREAM_NPM_ID = '@upstream/processing-remote@1'
  const UPSTREAM_FILE_ID = 'upstream-terrain'

  if (await upstreamArtefactExists(UPSTREAM_NPM_ID)) {
    console.log(`  ✓ upstream npm ${UPSTREAM_NPM_ID} (skipped)`)
  } else {
    const tarball = await createTestTarball({ name: '@upstream/processing-remote', version: '1.0.0', licence: 'MIT' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    form.append('category', 'processing')
    await upstreamUpload.post(`/api/v1/artefacts/npm/${encodeURIComponent(UPSTREAM_NPM_ID)}`, form, { headers: form.getHeaders() })
    console.log(`  + upstream npm ${UPSTREAM_NPM_ID}`)
  }

  if (await upstreamArtefactExists(UPSTREAM_FILE_ID)) {
    console.log(`  ✓ upstream file ${UPSTREAM_FILE_ID} (skipped)`)
  } else {
    const form = new FormData()
    form.append('file', Buffer.from('upstream-tileset-bytes'), { filename: 'upstream-terrain.mbtiles', contentType: 'application/octet-stream' })
    form.append('category', 'tileset')
    await upstreamUpload.post(`/api/v1/artefacts/file/${encodeURIComponent(UPSTREAM_FILE_ID)}`, form, { headers: form.getHeaders() })
    console.log(`  + upstream file ${UPSTREAM_FILE_ID}`)
  }

  // Public so any read key may download them.
  await upstreamAdmin.patch(`/api/v1/artefacts/${encodeURIComponent(UPSTREAM_NPM_ID)}`, { public: true })
  await upstreamAdmin.patch(`/api/v1/artefacts/${encodeURIComponent(UPSTREAM_FILE_ID)}`, { public: true })

  // A read key requires an access grant for its owner account, minted by an admin of it.
  try {
    await upstreamAdmin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    console.log('  + upstream access-grant organization:test1')
  } catch (err) {
    if (!isHttp409(err)) throw err
    console.log('  ✓ upstream access-grant organization:test1 (skipped)')
  }

  // Consult the upstream itself, not just our output file — the api-test suite
  // wipes the upstream between runs (cleanUpstream), so a raw key cached here can
  // reference a key the upstream no longer has. Mirrors the upload-key logic above.
  //
  // The read-key LIST endpoint filters by the caller's own account, so a read key
  // owned by org test1 is only visible through a test1-scoped session — never to a
  // plain superadmin session. List and mint through the same org admin.
  const orgAdmin = await upstreamAxiosAuth('test1-admin1', { org: 'test1' })
  const upstreamReadKeys = await orgAdmin.get('/api/v1/api-keys?type=read')
  const hasFederationKey = upstreamReadKeys.data.results.some((k: any) => k.name === 'dev-federation')
  if (hasFederationKey && output.keys['dev-upstream-read']) {
    console.log('  ✓ upstream read-key dev-federation (skipped)')
  } else {
    const res = await orgAdmin.post('/api/v1/api-keys', {
      type: 'read',
      name: 'dev-federation',
      owner: { type: 'organization', id: 'test1' }
    })
    output.keys['dev-upstream-read'] = res.data.key
    console.log('  + upstream read-key dev-federation (owner organization:test1)')
    await saveOutput(output)
  }

  // Downstream: register the mirror and select both artefacts. Deliberately does NOT
  // sync — leave the "Sync now" button for a human to click.
  try {
    await admin.post('/api/v1/remote-registries', {
      url: upstreamUrl,
      name: 'Dev upstream',
      apiKey: output.keys['dev-upstream-read']
    })
    console.log(`  + remote-registry ${upstreamUrl}`)
  } catch (err) {
    if (!isHttp409(err)) throw err
    console.log(`  ✓ remote-registry ${upstreamUrl} (skipped)`)
  }

  // Always refresh the stored key: on a re-run the read key above may have been
  // re-minted, and the existing registry doc would otherwise keep ciphering the
  // old, now-invalid key — the cause of a 401 when browsing the mirror.
  await admin.patch(`/api/v1/remote-registries/${encodeURIComponent(upstreamUrl)}`, {
    apiKey: output.keys['dev-upstream-read']
  })

  for (const artefactId of [UPSTREAM_NPM_ID, UPSTREAM_FILE_ID]) {
    try {
      await admin.post(`/api/v1/remote-registries/${encodeURIComponent(upstreamUrl)}/selected-artefacts`, { artefactId })
      console.log(`  + selected ${artefactId}`)
    } catch (err) {
      if (!isHttp409(err)) throw err
      console.log(`  ✓ selected ${artefactId} (skipped)`)
    }
  }

  console.log('\n  → Sync is wired but not run. Click "Sync now" in the admin UI to exercise it.')

  console.log(`\n✔ Fixtures applied. API keys written to ${OUTPUT_PATH}`)
}

main().then(
  () => process.exit(0),
  (err) => {
    const status = err?.response?.status || err?.status
    const data = err?.response?.data
    console.error('✘ Fixture injection failed:', err?.message || err)
    if (status) console.error(`   HTTP ${status}`, data ?? '')
    process.exit(1)
  }
)
