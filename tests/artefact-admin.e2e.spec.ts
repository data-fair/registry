import { test, expect, type Page } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

const pkgId = '@test/grouped-pkg@1'

test.beforeAll(async () => {
  await clean()
  const ax = await superAdmin
  const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'e2e-artefact-admin' })
  const upload = axiosWithApiKey(keyRes.data.key)

  const tarball = await createTestTarball({ name: '@test/grouped-pkg', version: '1.0.0' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent(pkgId), form, { headers: form.getHeaders() })

  // Mimic the processings upgrade script: set a localized group (and a
  // documentation URL) through the metadata PATCH endpoint.
  await ax.patch('/api/v1/artefacts/' + encodeURIComponent(pkgId), {
    group: { en: 'Geo tools', fr: 'Outils géo' },
    documentation: 'https://example.com/docs'
  })
})

test.describe('Artefact admin metadata editing', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page)
  })

  // The e2e environment renders the UI in French.
  test('existing group and documentation values are loaded into the edit form', async ({ page }) => {
    await page.goto('/registry/artefacts/' + encodeURIComponent(pkgId))
    await expect(page.locator('#artefact-admin')).toBeVisible()
    await expect(page.getByLabel('Groupe - Anglais')).toHaveValue('Geo tools')
    await expect(page.getByLabel('Groupe - Français')).toHaveValue('Outils géo')
    await expect(page.getByLabel('URL de documentation')).toHaveValue('https://example.com/docs')
  })

  test('editing the group and saving persists the new value', async ({ page }) => {
    await page.goto('/registry/artefacts/' + encodeURIComponent(pkgId))
    await expect(page.locator('#artefact-admin')).toBeVisible()

    const groupEn = page.getByLabel('Groupe - Anglais')
    await groupEn.fill('Mapping tools')
    await groupEn.blur()
    await page.locator('#artefact-admin').getByRole('button', { name: 'Enregistrer' }).click()
    await expect(page.getByText('Modifications enregistrées')).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Groupe - Anglais')).toHaveValue('Mapping tools')
  })
})

// Logs in as an admin (admin mode on) by replaying the simple-directory password
// flow on the page's request context, so the browser context carries the session.
async function loginAdmin (page: Page) {
  const directoryUrl = `http://localhost:${process.env.NGINX_PORT}/simple-directory`
  const res = await page.request.post(directoryUrl + '/api/auth/password', {
    data: { email: 'superadmin@test.com', password: 'passwd', adminMode: true },
    params: { redirect: directoryUrl },
    maxRedirects: 0
  })
  let callbackUrl = (await res.text()).trim()
  if (callbackUrl.startsWith(directoryUrl + '/simple-directory')) {
    callbackUrl = callbackUrl.replace(directoryUrl + '/simple-directory', directoryUrl)
  }
  await page.request.get(callbackUrl, { maxRedirects: 0 })
}
