import {expect, test} from '@repo/e2e'

test.describe('Organization Document Explorer', () => {
  test('navigates the project → dataset → type hierarchy and paginates documents', async ({
    page,
    getClient,
    createDocuments,
    getPageContext,
  }) => {
    const client = getClient()
    const {projectId, dataset} = client.config()
    if (!projectId || !dataset) {
      throw new Error('E2E client is missing a projectId/dataset')
    }

    // Create enough authors to span multiple pages at a page size of 5.
    await createDocuments(
      Array.from({length: 12}, (_, i) => ({
        _type: 'author',
        name: `Org Explorer Author ${i}`,
      })),
      {asDraft: false},
    )

    await page.goto('./org-document-explorer')
    const pageContext = await getPageContext(page)

    // Drill down from project to dataset to document type
    const projectSelect = pageContext.getByTestId('org-project-select')
    await projectSelect.selectOption(projectId)

    const datasetSelect = pageContext.getByTestId('org-dataset-select')
    await datasetSelect.selectOption(dataset)

    const typeSelect = pageContext.getByTestId('org-doctype-select')
    await typeSelect.selectOption('author')

    // The documents table should render.
    const table = pageContext.getByTestId('org-document-table')
    await expect(table).toBeVisible()

    // Shrink the page size so 12 authors span to 3 pages
    await pageContext.getByTestId('list-page-size-author').selectOption('5')

    const rows = pageContext.locator('[data-testid^="org-document-row-"]')
    await expect.poll(() => rows.count(), {timeout: 15000}).toBe(5)

    const status = pageContext.getByTestId('pagination-status').first()
    /*
     * Don't specify particular pages:
     * Tests run in parallel so there may be more than 3 pages due to docs created in other tests
     */
    await expect(status).toContainText('Page 1 of')
    await expect(pageContext.getByTestId('pagination-previous').first()).toBeDisabled() // test hasPreviousPage
    await expect(pageContext.getByTestId('pagination-next').first()).toBeEnabled() // test hasNextPage

    // Advancing a page keeps a full page of rows and updates the status.
    await pageContext.getByTestId('pagination-next').first().click()
    await expect(status).toContainText('Page 2 of')
    await expect.poll(() => rows.count(), {timeout: 15000}).toBe(5)
    await expect(pageContext.getByTestId('pagination-previous').first()).toBeEnabled() // test hasPreviousPage
  })

  test('views organization users in a dialog', async ({page, getClient, getPageContext}) => {
    const {projectId} = getClient().config()
    if (!projectId) {
      throw new Error('E2E client is missing a projectId')
    }

    await page.goto('./org-document-explorer')
    const pageContext = await getPageContext(page)

    const projectSelect = pageContext.getByTestId('org-project-select')
    await projectSelect.waitFor()
    await projectSelect.selectOption(projectId)

    // Open the users dialog from the project header.
    const viewUsers = pageContext.getByRole('button', {name: 'View Users'})
    await viewUsers.waitFor()
    await viewUsers.click()

    await expect(pageContext.getByText('Project Users')).toBeVisible()

    // At least the current user should be listed
    const users = pageContext.locator('[data-testid^="user-list-item-"]')
    await expect.poll(() => users.count(), {timeout: 15000}).toBeGreaterThan(0)
  })
})
