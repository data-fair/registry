import { test, expect, type Page } from '@playwright/test'
import { superAdmin, clean } from './support/axios.ts'

test.describe('Read API key creation (UI)', () => {
  test.beforeEach(async ({ page }) => {
    await clean()
    // Grant test1 org access so the API Keys tab becomes available.
    const admin = await superAdmin
    await admin.post('/api/v1/access-grants', { account: { type: 'organization', id: 'test1' } })
    await loginOrg(page, 'test1-admin1', 'test1')
  })

  // Regression: the create form used to send the whole session account as
  // `owner`, including `name`, which the post-req schema rejects.
  test('an org member can create a read key from the keys tab', async ({ page }) => {
    await page.goto('/registry/')
    await page.getByRole('tab', { name: 'Clés API' }).click()
    await page.getByLabel('Nom de la clé').fill('my-federation-key')
    await page.getByRole('button', { name: 'Créer' }).click()
    await expect(page.getByText('Clé créée avec succès')).toBeVisible()
  })
})

// Logs in as a regular org member (no admin mode) with the org as the active
// account, by replaying the simple-directory password flow on the page context.
async function loginOrg (page: Page, user: string, org: string) {
  const directoryUrl = `http://localhost:${process.env.NGINX_PORT}/simple-directory`
  const res = await page.request.post(directoryUrl + '/api/auth/password', {
    data: { email: user + '@test.com', password: 'passwd', org },
    params: { redirect: directoryUrl },
    maxRedirects: 0
  })
  let callbackUrl = (await res.text()).trim()
  if (callbackUrl.startsWith(directoryUrl + '/simple-directory')) {
    callbackUrl = callbackUrl.replace(directoryUrl + '/simple-directory', directoryUrl)
  }
  await page.request.get(callbackUrl, { maxRedirects: 0 })
}
