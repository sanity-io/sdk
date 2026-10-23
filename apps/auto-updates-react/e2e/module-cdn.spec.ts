import {expect, test} from '@repo/e2e'

test.describe('Module CDN', () => {
  test('loads the SDK from the module CDN', async ({page, getPageContext}) => {
    await page.goto('./')
    const pageContext = await getPageContext(page)

    await expect(pageContext.getByTestId('current-user')).not.toBeEmpty()
  })
})
