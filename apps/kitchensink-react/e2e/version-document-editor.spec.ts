import {expect, test} from '@repo/e2e'

test.describe('Version Document Editor', () => {
  test('can create and edit a version document in a release', async ({
    page,
    getClient,
    getPageContext,
  }) => {
    const client = getClient()

    // Create a content release to test against
    const {releaseId} = await client.releases.create({
      metadata: {
        title: 'Version Editor Test Release',
        releaseType: 'undecided',
      },
    })

    await page.goto('./releases')
    const pageContext = await getPageContext(page)

    // Wait for the route to be ready
    const heading = pageContext.getByText('Releases', {exact: true}).first()
    await expect(heading).toBeVisible({timeout: 30000})

    // Select the release in the autocomplete
    const autocompleteInput = pageContext.locator('input[placeholder="Type to find release …"]')
    await expect(autocompleteInput).toBeVisible()
    await autocompleteInput.click()
    await autocompleteInput.fill('Version Editor Test Release')

    const releaseButton = pageContext.getByRole('button', {
      name: new RegExp(`Version Editor Test Release.*Release ID: ${releaseId}`),
    })
    await expect(releaseButton).toBeVisible({timeout: 10000})
    await releaseButton.click()

    await expect(autocompleteInput).toHaveValue('Version Editor Test Release', {timeout: 10000})

    // Enter a new (unique) document ID to create as a version document in this release
    const newDocumentId = `test-version-doc-${Date.now()}`
    const documentIdInput = pageContext.locator('input[placeholder="Enter document ID"]')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(newDocumentId)
    await pageContext.getByRole('button', {name: 'View Document'}).click()

    // Open the document editor dialog (release perspective is now active)
    const editDocumentButton = pageContext.getByRole('button', {name: 'Edit Document'})
    await expect(editDocumentButton).toBeVisible()
    await editDocumentButton.click()

    // Wait for the dialog to appear
    const dialog = pageContext.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // The document doesn't exist in the release yet — wait for permissions to
    // resolve, then click Create to create the version document
    const createButton = dialog.getByRole('button', {name: 'Create'})
    await expect(createButton).toBeEnabled({timeout: 10000})
    await createButton.click()

    // Update the name field once the version document has been created
    const nameInput = dialog.getByTestId('name-input')
    await expect(nameInput).toBeVisible({timeout: 10000})
    await nameInput.fill('My Release Document')
    await nameInput.press('Enter')

    // Verify the name change is reflected in the live-bound name input
    await expect(nameInput).toHaveValue('My Release Document', {timeout: 10000})
  })
})
