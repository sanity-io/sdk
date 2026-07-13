import {expect, test} from '@repo/e2e'

test.describe('Document List', () => {
  test('can list and update author documents', async ({
    page,
    getClient,
    createDocuments,
    getPageContext,
  }) => {
    const client = getClient()

    // Create 10 author documents in a single transaction
    const {documentIds} = await createDocuments(
      Array.from({length: 10}, (_, i) => ({
        _type: 'author',
        name: `Test Author ${i}`,
        biography: `This is a test biography for author ${i}`,
      })),
      {asDraft: false},
    )

    // Query for the most recent document by _updatedAt
    // (it should be at the top of the list and thus visible in the viewport for the test)
    const mostRecentDoc = await client.fetch(
      `*[_id in $documentIds] | order(_updatedAt desc)[0]{_id}`,
      {documentIds},
    )

    const id = mostRecentDoc._id

    // Navigate to the document list
    await page.goto('./document-list')

    // we may be in an iframe or just a page -- get the right locators
    const pageContext = await getPageContext(page)

    // Wait for the target document to be visible
    const targetDocumentPreview = pageContext.getByTestId(`document-preview-${id}`)
    await targetDocumentPreview.waitFor()
    await expect(targetDocumentPreview).toBeVisible()

    // Skip external update test for standalone mode (WebKit on localhost)
    // Real-time subscriptions are unreliable in this mode
    if (pageContext.isDashboard) {
      // Update the document using the client
      await client.patch(id).set({name: 'Updated Author Name'}).commit()

      // Wait for the document preview to update with the new name
      // Increase timeout as the update needs to propagate via subscriptions/queries
      await expect(async () => {
        const updatedDocumentPreview = pageContext.getByTestId(`document-preview-${id}`)
        await expect(updatedDocumentPreview).toBeVisible()

        const updatedDocumentTitle = await updatedDocumentPreview
          .getByTestId('document-title')
          .textContent()
        expect(updatedDocumentTitle).toBe('Updated Author Name')
      }).toPass({timeout: 10000})
    }
  })

  test('progressively loads more documents as the sentinel scrolls into view', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    // `useDocuments` loads in batches of 25, so 30 documents guarantees a
    // second batch that only arrives once the LoadMore sentinel is visible.
    await createDocuments(
      Array.from({length: 30}, (_, i) => ({
        _type: 'author',
        name: `LoadMore Author ${i}`,
      })),
      {asDraft: false},
    )

    await page.goto('./document-list')
    const pageContext = await getPageContext(page)

    const previews = pageContext.locator('[data-testid^="document-preview-"]')

    // First batch renders (25 items) before any scrolling.
    await expect.poll(() => previews.count(), {timeout: 15000}).toBeGreaterThanOrEqual(25)
    const initialCount = await previews.count()

    // Scrolling the sentinel into view triggers the next batch.
    await pageContext.getByTestId('load-more').scrollIntoViewIfNeeded()
    await expect.poll(() => previews.count(), {timeout: 15000}).toBeGreaterThan(initialCount)
  })
})
