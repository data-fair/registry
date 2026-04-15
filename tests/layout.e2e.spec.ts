import { test, expect } from '@playwright/test'
import FormData from 'form-data'
import { superAdmin, axiosWithApiKey, clean } from './support/axios.ts'
import { createTestTarball } from './support/test-tarball.ts'

test.describe('App layout', () => {
  test.beforeAll(async () => {
    await clean()
    const ax = await superAdmin
    const keyRes = await ax.post('/api/v1/api-keys', { type: 'upload', name: 'e2e-layout' })
    const upload = axiosWithApiKey(keyRes.data.key)

    const tarball = await createTestTarball({ name: '@test/layout-pkg', version: '1.0.0', category: 'processing' })
    const form = new FormData()
    form.append('file', tarball, { filename: 'package.tgz', contentType: 'application/gzip' })
    await upload.post('/api/v1/artefacts/%40test%2Flayout-pkg/versions', form, { headers: form.getHeaders() })
    await ax.patch('/api/v1/artefacts/%40test%2Flayout-pkg%401', { public: true })
  })

  test('home page shows app bar title and no breadcrumbs', async ({ page }) => {
    await page.goto('/registry/')
    await expect(page.locator('header').getByText('@data-fair/registry')).toBeVisible()
    await expect(page.locator('.v-breadcrumbs')).toHaveCount(0)
  })

  test('artefacts list shows breadcrumb trail', async ({ page }) => {
    await page.goto('/registry/artefacts')
    await expect(page.locator('header').getByText('@data-fair/registry')).toBeVisible()
    const crumbs = page.locator('.v-breadcrumbs .v-breadcrumbs-item')
    await expect(crumbs).toHaveCount(1)
    await expect(crumbs.first()).toHaveText('Artefacts')
  })

  test('artefact detail shows two-level breadcrumbs and first crumb navigates back', async ({ page }) => {
    await page.goto('/registry/artefacts/%40test%2Flayout-pkg%401')
    const crumbs = page.locator('.v-breadcrumbs .v-breadcrumbs-item')
    await expect(crumbs).toHaveCount(2)
    await expect(crumbs.first()).toHaveText('Artefacts')
    await expect(crumbs.nth(1)).toContainText('@test/layout-pkg')

    await crumbs.first().click()
    await expect(page).toHaveURL(/\/registry\/artefacts$/)
  })

  test('only one app bar renders', async ({ page }) => {
    await page.goto('/registry/artefacts')
    await expect(page.locator('header.v-app-bar')).toHaveCount(1)
  })
})
