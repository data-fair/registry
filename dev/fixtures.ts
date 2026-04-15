// Seeds the dev stack with representative fixtures: API keys, npm artefacts,
// file artefacts, thumbnails, and access grants. Idempotent — re-running skips
// anything already present. Requires the dev API to be running.
//
// Run: npm run dev:fixtures

import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, baseURL } from '../tests/support/axios.ts'
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

async function main () {
  console.log(`→ Connecting to ${baseURL}`)
  const admin = await superAdmin
  const output = await loadOutput()

  // --- API keys -----------------------------------------------------------
  const keySpecs: { name: string, body: Record<string, unknown> }[] = [
    { name: 'dev-upload-unrestricted', body: { type: 'upload', name: 'dev-upload-unrestricted' } },
    { name: 'dev-upload-koumoul', body: { type: 'upload', name: 'dev-upload-koumoul', allowedNames: ['@koumoul/*'] } }
  ]

  const existingKeys = await admin.get('/api/v1/api-keys')
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
  const npmSpecs: { name: string, category: string, versions: string[] }[] = [
    { name: '@koumoul/processing-hello', category: 'processing', versions: ['1.0.0', '1.0.1', '1.1.0'] },
    { name: '@koumoul/application-demo', category: 'application', versions: ['1.0.0'] },
    { name: '@test/catalog-sample', category: 'catalog', versions: ['2.0.0'] }
  ]

  for (const spec of npmSpecs) {
    const major = spec.versions[spec.versions.length - 1].split('.')[0]
    const id = `${spec.name}@${major}`
    if (await artefactExists(id)) {
      console.log(`  ✓ npm ${id} (skipped)`)
      continue
    }
    for (const version of spec.versions) {
      const tarball = await createTestTarball({ name: spec.name, version, licence: 'MIT', category: spec.category })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await upload.post(
        `/api/v1/artefacts/${encodeURIComponent(spec.name)}/versions`,
        form,
        { headers: form.getHeaders() }
      )
    }
    console.log(`  + npm ${id} (${spec.versions.length} versions)`)
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
        privateAccess: [{ type: 'organization', id: 'test1' }],
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
      body: { privateAccess: [{ type: 'organization', id: 'test1' }] }
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
