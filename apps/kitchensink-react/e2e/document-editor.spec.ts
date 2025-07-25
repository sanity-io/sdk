import {expect, test} from '@repo/e2e'

test.describe('Document Editor', () => {
  test('can edit an author document', async ({page, createDocuments, getPageContext}) => {
    // Create an author document
    const {
      documentIds: [id],
    } = await createDocuments([
      {
        _type: 'author',
        name: 'Test Author for document editor',
        biography: 'This is a test biography',
      },
    ])

    // Navigate to the document editor
    await page.goto('./document-editor')

    // we may be in an iframe or just a page -- get the right locators
    const pageContext = await getPageContext(page)

    // Wait for the document to load
    await pageContext.getByTestId('document-id-input').fill(id.replace('drafts.', ''))
    await pageContext.getByTestId('load-document-button').click()

    // Wait for the document to be loaded and match expected initial values
    await expect(async () => {
      const content = await pageContext.getByTestId('document-content').textContent()
      const document = JSON.parse(content || '{}')
      expect(document.name).toBe('Test Author for document editor')
      expect(document.biography).toBe('This is a test biography')
    }).toPass({timeout: 5000})

    // Update content
    await pageContext.getByTestId('name-input').fill('Updated Author Name')
    await pageContext.getByTestId('name-input').press('Enter')

    // Verify the changes are reflected
    const updatedContent = await pageContext.getByTestId('document-content').textContent()
    const updatedDocument = JSON.parse(updatedContent || '{}')
    expect(updatedDocument.name).toBe('Updated Author Name')
    expect(updatedDocument.biography).toBe('This is a test biography')

    // we should play with the other actions here (delete, discard, publish, etc)
    // and also see what happens in the browser if we update the value via the client (does it sync? race conditions?)
  })
})
