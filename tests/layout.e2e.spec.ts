import { test, expect, type Page } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

const layoutPkgId = '@test/layout-pkg@1'

test.beforeAll(async () => {
  await clean()
  const ax = await superAdmin
  const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'e2e-layout' })
  const upload = axiosWithApiKey(keyRes.data.key)

  const tarball = await createTestTarball({ name: '@test/layout-pkg', version: '1.0.0' })
  const form = new FormData()
  form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
  await upload.post('/api/v1/artefacts/npm/' + encodeURIComponent(layoutPkgId), form, { headers: form.getHeaders() })
  await ax.patch('/api/v1/artefacts/' + encodeURIComponent(layoutPkgId), { public: true })
})

test.describe('App layout (anonymous)', () => {
  // The list page emits a single artefact-count crumb so an embedding shell
  // (data-fair) does not open the Registry tab on an empty trail — see a61123d.
  test('home page shows the artefacts list with a single count breadcrumb', async ({ page }) => {
    await page.goto('/registry/')
    await expect(page.locator('header').getByText('@data-fair/registry')).toBeVisible()
    const crumbs = page.locator('.v-breadcrumbs .v-breadcrumbs-item')
    await expect(crumbs).toHaveCount(1)
    await expect(crumbs.first()).toContainText('artefact')
    await expect(page.getByText(layoutPkgId).first()).toBeVisible()
  })

  test('artefact detail shows two-level breadcrumbs and first crumb navigates home', async ({ page }) => {
    await page.goto('/registry/artefacts/' + encodeURIComponent(layoutPkgId))
    const crumbs = page.locator('.v-breadcrumbs .v-breadcrumbs-item')
    await expect(crumbs).toHaveCount(2)
    await expect(crumbs.first()).toHaveText('Artefacts')
    await expect(crumbs.nth(1)).toContainText('@test/layout-pkg')
    await expect(page.locator('#artefact-admin')).toHaveCount(0)

    await crumbs.first().click()
    await expect(page).toHaveURL(/\/registry\/$/)
  })

  test('only one app bar renders', async ({ page }) => {
    await page.goto('/registry/')
    await expect(page.locator('header.v-app-bar')).toHaveCount(1)
  })

  test('app bar has no admin link for anonymous visitors', async ({ page }) => {
    await page.goto('/registry/')
    await expect(page.locator('header').getByRole('link', { name: 'Administration' })).toHaveCount(0)
  })
})

test.describe('Admin layout', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page)
  })

  test('app bar shows the admin link', async ({ page }) => {
    await page.goto('/registry/')
    await expect(page.locator('header').getByRole('link', { name: 'Administration' })).toBeVisible()
  })

  test('admin page stacks the three section-tabs with titles and subtitles', async ({ page }) => {
    await page.goto('/registry/admin')
    for (const id of ['#api-keys', '#access-grants', '#remote-registries']) {
      await expect(page.locator(id)).toBeVisible()
      await expect(page.locator(`${id} .text-title-large`)).not.toBeEmpty()
      await expect(page.locator(`${id} .text-body-medium`)).not.toBeEmpty()
    }
  })

  test('artefact detail shows inline admin editing sections', async ({ page }) => {
    await page.goto('/registry/artefacts/' + encodeURIComponent(layoutPkgId))
    await expect(page.locator('#artefact-admin')).toBeVisible()
  })

  test('access grants section searches accounts and grants access', async ({ page }) => {
    await page.goto('/registry/admin')
    const search = page.locator('#access-grants input').first()
    await search.click()
    await search.fill('Test Organization')

    // Search hits the simple-directory accounts endpoint; pick the matching org.
    await page.getByRole('option', { name: /Test Organization 1/ }).click()
    await page.locator('#access-grants .v-btn--variant-flat').click()

    const grantsTable = page.locator('#access-grants table')
    await expect(grantsTable).toContainText('Test Organization 1')
    await expect(grantsTable).toContainText('test1')
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
