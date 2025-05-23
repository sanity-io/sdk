// we may want to have our own unauthenticated fixture in the future.
import {test as baseTest} from '@playwright/test'
import {expect, test} from '@repo/e2e'

test.describe('Authenticated', () => {
  // This test isn't relevant for most public uses of the SDK,
  // but it's useful for working with Playwright tests locally
  test('Kitchen sink loads with localStorage auth token', async ({page}) => {
    await page.goto('/')

    // should be able to see the component beneath the AuthBoundary
    await expect(page.getByTestId('project-auth-home')).toBeVisible()
    // Verify we're authenticated by checking for the absence of the sign-in link
    await expect(page.getByRole('link', {name: 'Sign in with email'})).not.toBeVisible()
  })

  baseTest('Can test unauthenticated state', async ({page}) => {
    await page.goto('/')
    // The sign in link should be visible when not authenticated
    await expect(page.getByRole('link', {name: 'Sign in with email'})).toBeVisible()
  })
})
