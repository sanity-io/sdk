import {Page} from '@playwright/test'

// Helper function to clear auth state
export async function clearAuth(page: Page) {
  // First navigate to a page that allows localStorage access
  await page.goto('/', {waitUntil: 'networkidle'})
  // Then clear the auth token
  await page.evaluate(() => {
    window.localStorage.removeItem('__sanity_auth_token')
  })
}
