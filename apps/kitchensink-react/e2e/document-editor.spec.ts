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

    // Wait for the input to be ready, then load the document
    const documentIdInput = pageContext.getByTestId('document-id-input')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(id.replace('drafts.', ''))
    await pageContext.getByTestId('load-document-button').click()

    // Wait for the document to be loaded and match expected initial values
    await expect(async () => {
      const content = await pageContext.getByTestId('document-content').textContent()
      const document = JSON.parse(content || '{}')
      expect(document.name).toBe('Test Author for document editor')
      expect(document.biography).toBe('This is a test biography')
    }).toPass({timeout: 10000})

    // Update content
    await pageContext.getByTestId('name-input').fill('Updated Author Name')
    await pageContext.getByTestId('name-input').press('Enter')

    // Verify the changes are reflected
    // Use toPass() to retry as the mutation may take time to complete
    await expect(async () => {
      const updatedContent = await pageContext.getByTestId('document-content').textContent()
      const updatedDocument = JSON.parse(updatedContent || '{}')
      expect(updatedDocument.name).toBe('Updated Author Name')
      expect(updatedDocument.biography).toBe('This is a test biography')
    }).toPass({timeout: 10000})

    // we should play with the other actions here (delete, discard, publish, etc)
    // and also see what happens in the browser if we update the value via the client (does it sync? race conditions?)
  })

  test('creates a new document with useCreateDocument and navigates to it', async ({
    page,
    createDocuments,
    trackDocumentsForCleanup,
    getPageContext,
  }) => {
    // Seed a document so the editor has something loaded to start from.
    const {
      documentIds: [id],
    } = await createDocuments([
      {
        _type: 'author',
        name: 'Original Author',
      },
    ])
    const originalId = id.replace('drafts.', '')

    await page.goto('./document-editor')
    const pageContext = await getPageContext(page)

    const documentIdInput = pageContext.getByTestId('document-id-input')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(originalId)
    await pageContext.getByTestId('load-document-button').click()

    await expect(async () => {
      const content = await pageContext.getByTestId('document-content').textContent()
      expect(JSON.parse(content || '{}').name).toBe('Original Author')
    }).toPass({timeout: 10000})

    // Create a brand-new document via the hook; it generates the id and the UI
    // navigates to the returned handle.
    await pageContext.getByTestId('document-editor-action-create-hook').click()

    // The hook mints the id in the browser, so register it for teardown to
    // avoid leaking a document into the dataset on every run.
    let createdId: string | undefined
    await expect(async () => {
      const content = await pageContext.getByTestId('document-content').textContent()
      const document = JSON.parse(content || '{}')
      // AUTHOR_INITIAL_VALUES.name from DocumentEditorRoute
      expect(document.name).toBe('New Author')
      const newId = document._id.replace('drafts.', '')
      expect(newId).not.toBe(originalId)
      createdId = newId
    }).toPass({timeout: 10000})

    if (createdId) trackDocumentsForCleanup(createdId)
  })
})
