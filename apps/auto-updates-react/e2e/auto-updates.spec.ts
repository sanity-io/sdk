import {expect, test} from '@repo/e2e'

test.describe('Auto-updates', () => {
  test('loads the SDK from the module server', async ({page, getPageContext}) => {
    await page.goto('./')
    const pageContext = await getPageContext(page)

    await expect(pageContext.getByTestId('current-user')).not.toBeEmpty()
  })
})
