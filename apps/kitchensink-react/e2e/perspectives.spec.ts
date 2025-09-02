import {expect, test} from '@repo/e2e'

test.describe('Perspectives route', () => {
  test('published panel does not show draft content', async ({page, getClient, getPageContext}) => {
    const client = getClient()

    // Create a published author
    const published = await client.create({
      _type: 'author',
      name: 'Author Base Name',
    })

    // Create a draft overlay for the same document id
    await client.createOrReplace({
      _id: `drafts.${published._id}`,
      _type: 'author',
      name: 'Author Draft Name',
    })

    // Navigate to the perspectives demo
    await page.goto('./perspectives')

    const pageContext = await getPageContext(page)

    // Wait for both panels to render
    const left = pageContext.getByRole('heading', {name: 'Drafts Resource Provider'})
    const right = pageContext.getByRole('heading', {name: 'Published Resource Provider'})
    await expect(left).toBeVisible()
    await expect(right).toBeVisible()

    // Panels render JSON with stable test ids
    const draftsPanel = pageContext.getByTestId('panel-drafts-json')
    const publishedPanel = pageContext.getByTestId('panel-published-json')

    // Validate content eventually reflects correct perspectives
    await expect(async () => {
      const draftsText = await draftsPanel.textContent()
      const publishedText = await publishedPanel.textContent()
      // Drafts subtree should show the draft overlay
      expect(draftsText).toContain('Author Draft Name')
      // Published subtree should not show draft name
      expect(publishedText).toContain('Author Base Name')
      expect(publishedText).not.toContain('Author Draft Name')
    }).toPass({timeout: 5000})
  })
})
