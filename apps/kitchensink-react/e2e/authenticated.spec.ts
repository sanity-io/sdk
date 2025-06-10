// we may want to have our own unauthenticated fixture in the future.
import {expect, test} from '@repo/e2e'

test.describe('Authenticated', () => {
  test('Kitchen sink loads when authenticated', async ({page}) => {
    await page.goto('/')

    // wait a bit -- the redirect can happen too quickly and then be misleading
    await page.waitForTimeout(1000)

    // should be able to see the component beneath the AuthBoundary
    await expect(page.getByTestId('project-auth-home')).toBeVisible()
    // Verify we're authenticated by checking for the absence of the sign-in link
    await expect(page.getByRole('link', {name: 'Sign in with email'})).not.toBeVisible()
  })
})

// We might go for a dedicated unauthenticated fixture in the future
// rather than just clearing the localStorage
test.describe('Unauthenticated', () => {
  test('Can test unauthenticated state', async ({page}) => {
    await page.goto('/')

    await page.evaluate(() => {
      window.localStorage.clear()
    })

    await page.reload()

    // should not be able to see the component beneath the AuthBoundary
    await expect(page.getByTestId('project-auth-home')).not.toBeVisible()
    // The sign in link should be visible when not authenticated
    await expect(page.getByRole('link', {name: 'Sign in with email'})).toBeVisible()
  })
})
