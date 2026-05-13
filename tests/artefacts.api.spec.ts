import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, anonymousAx, axiosAuth, axiosWithApiKey, axiosInternal, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

let uploadApiKey: string

test.describe('Artefacts', () => {
  test.beforeEach(async () => {
    await clean()
    // Create an upload API key for tests
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'test-upload' })
    uploadApiKey = keyRes.data.key
  })

  test.describe('Upload', () => {
    test('upload a tarball with valid API key', async () => {
      const tarball = await createTestTarball({
        name: '@test/processing-hello',
        version: '1.0.0',
        licence: 'MIT',
        category: 'processing'
      })

      const ax = axiosWithApiKey(uploadApiKey)
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

      const res = await ax.post('/api/v1/artefacts/%40test%2Fprocessing-hello/versions', form, {
        headers: form.getHeaders()
      })
      expect(res.status).toBe(201)
      expect(res.data.artefact.name).toBe('@test/processing-hello')
      expect(res.data.artefact.category).toBe('processing')
      expect(res.data.version.version).toBe('1.0.0')
      // npm artefact mirrors the latest version's tarball size for prominent display
      expect(typeof res.data.artefact.size).toBe('number')
      expect(res.data.artefact.size).toBeGreaterThan(0)

      // Audit trail: version detail carries uploadedBy
      const admin = await superAdmin
      const detail = await admin.get(`/api/v1/artefacts/${encodeURIComponent(res.data.artefact._id)}/versions/1.0.0`)
      expect(detail.data.uploadedBy).toBeTruthy()
      expect(detail.data.uploadedBy.shortId).toBeTruthy()
      expect(detail.data.uploadedBy.apiKeyName).toBe('test-upload')
      expect(typeof detail.data.size).toBe('number')
      expect(detail.data.size).toBeGreaterThan(0)
      expect(detail.data.size).toBe(res.data.artefact.size)
    })

    test('upload without API key returns 401', async () => {
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

      try {
        await anonymousAx.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, {
          headers: form.getHeaders()
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(401)
      }
    })

    test('upload with invalid API key returns 401', async () => {
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const ax = axiosWithApiKey('invalid-key')
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })

      try {
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, {
          headers: form.getHeaders()
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(401)
      }
    })

    test('scoped upload key accepts matching name', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'scoped',
        allowedName: 'terrain-france'
      })
      const scopedKey = keyRes.data.key
      expect(keyRes.data.allowedName).toBe('terrain-france')

      const upload = axiosWithApiKey(scopedKey)

      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      const res = await upload.post('/api/v1/artefacts/file/terrain-france', fileForm, { headers: fileForm.getHeaders() })
      expect(res.status).toBe(201)
    })

    test('scoped upload key rejects non-matching name', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'scoped',
        allowedName: 'terrain-france'
      })
      const scopedKey = keyRes.data.key
      const upload = axiosWithApiKey(scopedKey)

      // Reject npm upload outside the scope
      const tarball = await createTestTarball({ name: '@evil/payload', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      try {
        await upload.post('/api/v1/artefacts/%40evil%2Fpayload/versions', form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }

      // Reject file upload outside the scope
      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'basemap.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      try {
        await upload.post('/api/v1/artefacts/file/basemap-world', fileForm, { headers: fileForm.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('category-scoped upload key accepts matching category', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'tileset-only',
        allowedCategory: 'tileset'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'a.mbtiles', contentType: 'application/octet-stream' })
      fileForm.append('category', 'tileset')
      const res = await upload.post('/api/v1/artefacts/file/terrain-a', fileForm, { headers: fileForm.getHeaders() })
      expect(res.status).toBe(201)
    })

    test('category-scoped upload key rejects mismatched file category', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'tileset-only',
        allowedCategory: 'tileset'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      const fileForm = new FormData()
      fileForm.append('file', Buffer.from('x'), { filename: 'a.json', contentType: 'application/octet-stream' })
      fileForm.append('category', 'maplibre-style')
      try {
        await upload.post('/api/v1/artefacts/file/style-a', fileForm, { headers: fileForm.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('category-scoped upload key rejects mismatched npm manifest category', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'processing-only',
        allowedCategory: 'processing'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      const tarball = await createTestTarball({ name: '@test/cat-pkg', version: '1.0.0', category: 'catalog' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      try {
        await upload.post('/api/v1/artefacts/%40test%2Fcat-pkg/versions', form, { headers: form.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('upload key with both name and category scopes requires both to match', async () => {
      const ax = await superAdmin
      const keyRes = await ax.post('/api/v1/api-keys', {
        type: 'upload',
        name: 'terrain-tileset',
        allowedName: 'terrain-france',
        allowedCategory: 'tileset'
      })
      const upload = axiosWithApiKey(keyRes.data.key)

      // Matches both — accepted
      const okForm = new FormData()
      okForm.append('file', Buffer.from('x'), { filename: 'a.mbtiles', contentType: 'application/octet-stream' })
      okForm.append('category', 'tileset')
      const ok = await upload.post('/api/v1/artefacts/file/terrain-france', okForm, { headers: okForm.getHeaders() })
      expect(ok.status).toBe(201)

      // Name matches, category doesn't — rejected
      const badCatForm = new FormData()
      badCatForm.append('file', Buffer.from('x'), { filename: 'a.json', contentType: 'application/octet-stream' })
      badCatForm.append('category', 'maplibre-style')
      try {
        await upload.post('/api/v1/artefacts/file/terrain-france', badCatForm, { headers: badCatForm.getHeaders() })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })

    test('unscoped upload key still accepts any name', async () => {
      // The default key created in beforeEach has no allowedName — unrestricted.
      const upload = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@anywhere/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'p.tgz', contentType: 'application/gzip' })
      const res = await upload.post('/api/v1/artefacts/%40anywhere%2Fpkg/versions', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
    })

    test('internal secret can upload npm version', async () => {
      const ax = axiosInternal('secret-internal')
      const tarball = await createTestTarball({ name: '@test/internal-pkg', version: '1.0.0', category: 'processing' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      const res = await ax.post('/api/v1/artefacts/%40test%2Finternal-pkg/versions', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
      expect(res.data.artefact.name).toBe('@test/internal-pkg')

      const admin = await superAdmin
      const detail = await admin.get(`/api/v1/artefacts/${encodeURIComponent(res.data.artefact._id)}/versions/1.0.0`)
      expect(detail.data.uploadedBy.internal).toBe(true)
    })

    test('internal secret can upload raw file', async () => {
      const ax = axiosInternal('secret-internal')
      const form = new FormData()
      form.append('file', Buffer.from('internal-content'), { filename: 'terrain.mbtiles', contentType: 'application/octet-stream' })
      form.append('category', 'tileset')
      const res = await ax.post('/api/v1/artefacts/file/terrain-internal', form, { headers: form.getHeaders() })
      expect(res.status).toBe(201)
      expect(res.data.artefact.name).toBe('terrain-internal')
      expect(res.data.artefact.uploadedBy.internal).toBe(true)
    })

    test('upload second version updates artefact', async () => {
      const ax = axiosWithApiKey(uploadApiKey)

      const tarball1 = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form1 = new FormData()
      form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form1, { headers: form1.getHeaders() })

      const tarball2 = await createTestTarball({ name: '@test/pkg', version: '1.1.0' })
      const form2 = new FormData()
      form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
      const res = await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form2, { headers: form2.getHeaders() })

      expect(res.data.artefact.version).toBe('1.1.0')
    })
  })

  test.describe('List & Detail', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // Upload a public artefact
      const tarball1 = await createTestTarball({ name: '@test/public-pkg', version: '1.0.0', category: 'processing' })
      const form1 = new FormData()
      form1.append('file', tarball1, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpublic-pkg/versions', form1, { headers: form1.getHeaders() })
      await admin.patch('/api/v1/artefacts/%40test%2Fpublic-pkg', { public: true })

      // Upload a private artefact
      const tarball2 = await createTestTarball({ name: '@test/private-pkg', version: '2.0.0', category: 'catalog' })
      const form2 = new FormData()
      form2.append('file', tarball2, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fprivate-pkg/versions', form2, { headers: form2.getHeaders() })
    })

    test('superadmin sees all artefacts', async () => {
      const ax = await superAdmin
      const res = await ax.get('/api/v1/artefacts')
      expect(res.data.count).toBe(2)
    })

    test('anonymous sees only public artefacts', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts')
      expect(res.data.count).toBe(1)
      expect(res.data.results[0].name).toBe('@test/public-pkg')
    })

    test('get artefact detail with versions', async () => {
      const ax = await superAdmin
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpublic-pkg')
      expect(res.data.name).toBe('@test/public-pkg')
      expect(res.data.versions).toHaveLength(1)
      expect(res.data.versions[0].version).toBe('1.0.0')
    })

    test('internal secret sees all artefacts in list', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts')
      expect(res.data.count).toBe(2)
    })

    test('internal secret can get private artefact detail', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/%40test%2Fprivate-pkg')
      expect(res.data.name).toBe('@test/private-pkg')
    })

    test('internal secret can resolve version on private artefact', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/%40test%2Fprivate-pkg/versions/2.0.0')
      expect(res.data.version).toBe('2.0.0')
    })
  })

  test.describe('PATCH & DELETE', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
    })

    test('superadmin can PATCH editable metadata', async () => {
      const ax = await superAdmin
      const res = await ax.patch('/api/v1/artefacts/%40test%2Fpkg', {
        title: { fr: 'Mon paquet', en: 'My package' },
        description: { fr: 'Une description', en: 'A description' },
        public: true
      })
      expect(res.data.title.fr).toBe('Mon paquet')
      expect(res.data.public).toBe(true)
    })

    test('superadmin can DELETE artefact', async () => {
      const ax = await superAdmin
      const deleteRes = await ax.delete('/api/v1/artefacts/%40test%2Fpkg')
      expect(deleteRes.status).toBe(204)

      const listRes = await ax.get('/api/v1/artefacts')
      expect(listRes.data.count).toBe(0)
    })
  })

  test.describe('Version resolution', () => {
    // Fixture chosen so all queried versions survive the cross-major prune
    // policy (older majors keep their latest only; latest major keeps last 2).
    // Resulting kept set: { 1.0.1, 2.1.0, 2.1.1 }.
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      for (const v of ['1.0.0', '1.0.1', '2.0.0', '2.1.0', '2.1.1']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: v })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      }
      // Make public so we can access versions
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', { public: true })
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', { public: true })
    })

    test('exact version match (older-major survivor)', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg/versions/1.0.1')
      expect(res.data.version).toBe('1.0.1')
    })

    test('minor-level resolution (latest patch)', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg/versions/2.1')
      expect(res.data.version).toBe('2.1.1')
    })

    test('major-level resolution (latest minor+patch)', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg/versions/2')
      expect(res.data.version).toBe('2.1.1')
    })

    test('older-major resolution by major selector', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fpkg/versions/1')
      expect(res.data.version).toBe('1.0.1')
    })
  })

  test.describe('Architecture-aware version resolution', () => {
    // Fixture stays inside major 1 so both 1.0.0 variants survive the
    // top-2-of-latest-major retention. Adding a 2.0.0 here would demote
    // major 1 to "older major" and prune everything below 1.0.1.
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // 1.0.0 — both arch variants
      for (const arch of ['arm64', 'x64']) {
        const tarball = await createTestTarball({ name: '@test/multiarch', version: '1.0.0' })
        const form = new FormData()
        form.append('architecture', arch)
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fmultiarch/versions', form, { headers: form.getHeaders() })
      }
      // 1.0.1 — only arm64
      const t11 = await createTestTarball({ name: '@test/multiarch', version: '1.0.1' })
      const f11 = new FormData()
      f11.append('architecture', 'arm64')
      f11.append('file', t11, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fmultiarch/versions', f11, { headers: f11.getHeaders() })

      await admin.patch('/api/v1/artefacts/%40test%2Fmultiarch', { public: true })
      await admin.patch('/api/v1/artefacts/%40test%2Fmultiarch', { public: true })
    })

    test('exact version, arch query param picks the matching variant', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fmultiarch/versions/1.0.0?architecture=arm64')
      expect(res.data.version).toBe('1.0.0')
      expect(res.data.architecture).toBe('arm64')
    })

    test('minor-level resolver: x64 worker requesting 1.0 gets only-x64 patch (1.0.0), since 1.0.1 is arm64-only', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fmultiarch/versions/1.0?architecture=x64')
      expect(res.data.version).toBe('1.0.0')
      expect(res.data.architecture).toBe('x64')
    })

    test('arm64 worker requesting 1.0 gets latest arm64 patch (1.0.1)', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fmultiarch/versions/1.0?architecture=arm64')
      expect(res.data.version).toBe('1.0.1')
      expect(res.data.architecture).toBe('arm64')
    })

    test('arch with no match and no noarch fallback returns 404', async () => {
      try {
        await anonymousAx.get('/api/v1/artefacts/%40test%2Fmultiarch/versions/1.0.1?architecture=x64')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('without architecture: legacy behaviour, returns whichever variant Mongo returns first', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fmultiarch/versions/1.0.0')
      expect(res.data.version).toBe('1.0.0')
      expect(['arm64', 'x64']).toContain(res.data.architecture)
    })

    test('tarball download honours architecture query param', async () => {
      const admin = await superAdmin
      // Need internal secret to introspect; use admin session for the download instead
      const arm = await admin.get('/api/v1/artefacts/%40test%2Fmultiarch/versions/1.0.0/tarball?architecture=arm64', {
        maxRedirects: 0,
        validateStatus: s => s === 200 || s === 302
      })
      // Just check we got a response without 404; redirect or stream is fine.
      expect([200, 302]).toContain(arm.status)
    })
  })

  test.describe('Architecture-aware noarch fallback', () => {
    // Separate scope from the multi-arch tests above so this fixture's
    // single major doesn't compete with theirs (mixing "2.0.0 noarch" and
    // "1.0.0 multi-arch" in one fixture would prune 1.0.0 once 2.0.0 makes
    // major 2 the new latest).
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      const t = await createTestTarball({ name: '@test/noarch', version: '1.0.0' })
      const form = new FormData()
      form.append('file', t, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fnoarch/versions', form, { headers: form.getHeaders() })

      await admin.patch('/api/v1/artefacts/%40test%2Fnoarch', { public: true })
      await admin.patch('/api/v1/artefacts/%40test%2Fnoarch', { public: true })
    })

    test('noarch fallback: x64 worker requesting an exact version gets the noarch tarball', async () => {
      const res = await anonymousAx.get('/api/v1/artefacts/%40test%2Fnoarch/versions/1.0.0?architecture=x64')
      expect(res.data.version).toBe('1.0.0')
      expect(res.data.architecture).toBeUndefined()
    })
  })

  test.describe('Cross-major retention', () => {
    test('latest major: keeps the 2 most recent patches within a single minor', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // Three patches in the same minor of the only/latest major.
      for (const v of ['1.0.0', '1.0.1', '1.0.2']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: v })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      }

      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', { public: true })

      // Top 2 (minor, patch) tuples of latest major → 1.0.2, 1.0.1.
      const detail = await admin.get('/api/v1/artefacts/%40test%2Fpkg')
      const versions = detail.data.versions.map((v: any) => v.version)
      expect(versions).toContain('1.0.2')
      expect(versions).toContain('1.0.1')
      expect(versions).not.toContain('1.0.0')
      expect(detail.data.versions).toHaveLength(2)
    })

    test('latest major: top-2 spans across minor branches (older minors get pruned)', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      for (const v of ['1.0.0', '1.0.1', '1.0.2', '1.1.0', '1.1.1']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: v })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      }

      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', { public: true })

      // Top 2 distinct (minor, patch) of latest major 1 → 1.1.1, 1.1.0.
      // All of 1.0.x are pruned because they're outside the top-2 of major 1.
      const detail = await admin.get('/api/v1/artefacts/%40test%2Fpkg')
      const versions = detail.data.versions.map((v: any) => v.version).sort()
      expect(versions).toEqual(['1.1.0', '1.1.1'])
    })

    test('older major: only its latest version is kept once a newer major is published', async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      // 1.0.0 + 1.0.1 in major 1; then a 2.0.0 promotes major 2 to "latest".
      // Major 1 falls back to "older major" → keep only its latest (1.0.1).
      for (const v of ['1.0.0', '1.0.1', '2.0.0']) {
        const tarball = await createTestTarball({ name: '@test/pkg', version: v })
        const form = new FormData()
        form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
        await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      }

      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', { public: true })

      const detail = await admin.get('/api/v1/artefacts/%40test%2Fpkg')
      const versions = detail.data.versions.map((v: any) => v.version).sort()
      expect(versions).toEqual(['1.0.1', '2.0.0'])
    })
  })

  test.describe('Tarball download', () => {
    test.beforeEach(async () => {
      const ax = axiosWithApiKey(uploadApiKey)
      const admin = await superAdmin

      const tarball = await createTestTarball({ name: '@test/pkg', version: '1.0.0' })
      const form = new FormData()
      form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
      await ax.post('/api/v1/artefacts/%40test%2Fpkg/versions', form, { headers: form.getHeaders() })
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', {
        public: true,
        privateAccess: [{ type: 'organization', id: 'test1' }]
      })
    })

    test('download with internal secret', async () => {
      const ax = axiosInternal('secret-internal')
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpkg/versions/1.0.0/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('gzip')
    })

    test('download with internal secret + x-account does not require an access-grant (public artefact)', async () => {
      const ax = axiosInternal('secret-internal')
      // No POST /access-grants for this account: a trusted sibling service
      // (processings worker acting on behalf of a processing owner) must be
      // able to fetch a public artefact's tarball without operator enrolment.
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpkg/versions/1.0.0/tarball', {
        responseType: 'arraybuffer',
        headers: { 'x-account': JSON.stringify({ type: 'organization', id: 'no-grant-org' }) }
      })
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toContain('gzip')
    })

    test('download with internal secret + x-account still respects privateAccess on a private artefact', async () => {
      const admin = await superAdmin
      await admin.patch('/api/v1/artefacts/%40test%2Fpkg', {
        public: false,
        privateAccess: [{ type: 'organization', id: 'test1' }]
      })
      const ax = axiosInternal('secret-internal')

      // account on privateAccess, no grant → allowed
      const ok = await ax.get('/api/v1/artefacts/%40test%2Fpkg/versions/1.0.0/tarball', {
        responseType: 'arraybuffer',
        headers: { 'x-account': JSON.stringify({ type: 'organization', id: 'test1' }) }
      })
      expect(ok.status).toBe(200)

      // account neither public nor on privateAccess → not visible
      try {
        await ax.get('/api/v1/artefacts/%40test%2Fpkg/versions/1.0.0/tarball', {
          headers: { 'x-account': JSON.stringify({ type: 'organization', id: 'other-org' }) }
        })
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    test('download with session + grant', async () => {
      const admin = await superAdmin
      await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })

      const ax = await axiosAuth('test1-admin1', { org: 'test1' })
      const res = await ax.get('/api/v1/artefacts/%40test%2Fpkg/versions/1.0.0/tarball', {
        responseType: 'arraybuffer'
      })
      expect(res.status).toBe(200)
    })

    test('download without access returns 403', async () => {
      const ax = await axiosAuth('dev-standalone1')
      try {
        await ax.get('/api/v1/artefacts/%40test%2Fpkg/versions/1.0.0/tarball')
        expect(true).toBe(false)
      } catch (err: any) {
        expect(err.status).toBe(403)
      }
    })
  })
})
