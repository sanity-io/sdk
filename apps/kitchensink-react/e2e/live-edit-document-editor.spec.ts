import {randomUUID} from 'node:crypto'

import {expect, test} from '@repo/e2e'

test.describe('Live edit document editor', () => {
  test('creates, edits, and deletes a published author via editor actions (no draft)', async ({
    page,
    getClient,
    getPageContext,
  }) => {
    const client = getClient()
    const liveDocId = `live-edit-${randomUUID()}`
    // not actually used -- we're checking for non-existence of draft
    const draftId = `drafts.${liveDocId}`

    // Navigate to the document editor
    await page.goto('./document-editor')

    // we may be in an iframe or just a page -- get the right locators
    const pageContext = await getPageContext(page)

    const liveEditCheckbox = pageContext.getByTestId('live-edit-checkbox')
    await expect(liveEditCheckbox).toBeVisible()
    await liveEditCheckbox.check()

    const documentIdInput = pageContext.getByTestId('document-id-input')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(liveDocId)

    await pageContext.getByTestId('load-document-button').click()

    await expect(pageContext.getByTestId('live-edit-mode-badge')).toBeVisible({timeout: 10000})
    await expect(pageContext.getByTestId('live-edit-mode-badge')).toHaveText('Live Edit Mode')

    const createButton = pageContext.getByTestId('document-editor-action-create')
    await expect(createButton).toBeEnabled({timeout: 15000})
    await createButton.click()

    const documentContent = pageContext.getByTestId('document-content')
    await expect(documentContent).toBeVisible({timeout: 15000})
    await expect(async () => {
      const content = await documentContent.textContent()
      const doc = JSON.parse(content || '{}')
      expect(doc._id).toBe(liveDocId)
      expect(doc._type).toBe('author')
    }).toPass({timeout: 15000})

    await expect(async () => {
      expect(
        await client.fetch<number>('count(*[_id == $publishedId])', {publishedId: liveDocId}),
      ).toBe(1)
      expect(await client.fetch<number>('count(*[_id == $draftId])', {draftId})).toBe(0)
    }).toPass({timeout: 15000})

    const nameInput = pageContext.getByTestId('name-input')
    await expect(nameInput).toBeVisible({timeout: 10000})
    await nameInput.fill('Live edit CRUD updated')
    await nameInput.press('Enter')

    await expect(nameInput).toHaveValue('Live edit CRUD updated', {timeout: 10000})

    await expect(async () => {
      const content = await documentContent.textContent()
      const doc = JSON.parse(content || '{}')
      expect(doc.name).toBe('Live edit CRUD updated')
    }).toPass({timeout: 15000})

    await expect(async () => {
      expect(
        await client.fetch<string | null>('*[_id == $publishedId][0].name', {
          publishedId: liveDocId,
        }),
      ).toBe('Live edit CRUD updated')
      expect(await client.fetch<number>('count(*[_id == $draftId])', {draftId})).toBe(0)
    }).toPass({timeout: 15000})

    const deleteButton = pageContext.getByTestId('document-editor-action-delete')
    await expect(deleteButton).toBeEnabled({timeout: 15000})
    await deleteButton.click()

    await expect(async () => {
      expect(
        await client.fetch<number>('count(*[_id == $publishedId])', {publishedId: liveDocId}),
      ).toBe(0)
      expect(await client.fetch<number>('count(*[_id == $draftId])', {draftId})).toBe(0)
    }).toPass({timeout: 15000})

    // manual delete here since we created the document directly in the editor
    await client
      .delete({
        query: '*[_id in $ids]',
        params: {ids: [liveDocId, draftId]},
      })
      .catch(() => {})
  })
})
