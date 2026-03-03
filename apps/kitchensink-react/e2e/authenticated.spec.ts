import {expect, test} from '@repo/e2e'

test.describe('Authenticated', () => {
  test('Kitchen sink loads when authenticated', async ({page, getPageContext}) => {
    await page.goto('./')

    // wait a bit -- the redirect can happen too quickly and then be misleading
    await page.waitForTimeout(1000)

    // we may be in an iframe or just a page -- get the right locators
    const pageContext = await getPageContext(page)

    // should be able to see the component beneath the AuthBoundary
    await expect(pageContext.getByTestId('project-auth-home')).toBeVisible()
    // Verify we're authenticated by checking for the absence of the login page (no Google sign-in)
    await expect(
      page.getByRole('link', {name: /google/i}).or(page.getByRole('button', {name: /google/i})),
    ).not.toBeVisible()
  })
})

// We might go for a dedicated unauthenticated fixture in the future
// rather than just clearing the localStorage
test.describe('Unauthenticated', () => {
  test('Can test unauthenticated state', async ({page, getPageContext}) => {
    await page.goto('./')

    const pageContext = await getPageContext(page)

    // Skip this test if we're in dashboard context - auth is handled by the dashboard
    test.skip(pageContext.isDashboard, 'Skipping unauthenticated test in dashboard context')

    await page.evaluate(() => {
      window.localStorage.clear()
    })

    await page.reload()

    // should not be able to see the component beneath the AuthBoundary
    await expect(pageContext.getByTestId('project-auth-home')).not.toBeVisible()
    await expect(
      page.getByRole('link', {name: /google/i}).or(page.getByRole('button', {name: /google/i})),
    ).toBeVisible()
  })
})
