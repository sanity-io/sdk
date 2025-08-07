import {expect, test} from '@repo/e2e'

test.describe('Multi Resource Route', () => {
  test('can view and edit documents from multiple resources', async ({
    page,
    getClient,
    createDocuments,
    getPageContext,
  }) => {
    // create an author document in dataset 0
    const {
      documentIds: [authorId],
    } = await createDocuments(
      [
        {
          _type: 'author',
          name: 'Test Author Multi Resource',
          role: 'developer',
          awards: ['Best Code Award', 'Innovation Prize'],
        },
      ],
      {asDraft: false}, // Create as published document
      process.env['SDK_E2E_DATASET_0'], // First dataset
    )

    // Create a player document in dataset 1
    const {
      documentIds: [playerId],
    } = await createDocuments(
      [
        {
          _type: 'player',
          name: 'Test Player Multi Resource',
          slackUserId: 'U1234567890',
        },
      ],
      {asDraft: false}, // Create as published document
      process.env['SDK_E2E_DATASET_1'], // Second dataset
    )

    await page.goto('./multi-resource')

    // get the page context for iframe/page detection
    const pageContext = await getPageContext(page)

    // Wait for both document cards to be visible
    await expect(pageContext.getByTestId(/^author-document-/)).toBeVisible()
    await expect(pageContext.getByTestId(/^player-document-/)).toBeVisible()

    // Verify author document content is displayed
    await expect(pageContext.getByTestId('author-name-display')).toHaveText(
      'Test Author Multi Resource',
    )

    // Verify player document content is displayed
    await expect(pageContext.getByTestId('player-name-display')).toHaveText(
      'Test Player Multi Resource',
    )

    // Test author projection data
    await expect(pageContext.getByTestId('author-projection-name')).toContainText(
      'Test Author Multi Resource',
    )
    await expect(pageContext.getByTestId('author-projection-role')).toContainText('developer')
    await expect(pageContext.getByTestId('author-projection-award-count')).toContainText('2')
    await expect(pageContext.getByTestId('author-projection-first-award')).toContainText(
      'Best Code Award',
    )

    // Test player projection data
    await expect(pageContext.getByTestId('player-projection-name')).toContainText(
      'Test Player Multi Resource',
    )
    await expect(pageContext.getByTestId('player-projection-slack-id')).toContainText('U1234567890')
    await expect(pageContext.getByTestId('player-projection-has-slack')).toContainText('Yes')

    // Test editing the author document
    const authorNameInput = pageContext.getByTestId('author-name-input')
    await authorNameInput.fill('Updated Author Name')
    await authorNameInput.press('Enter')

    // Verify the change is reflected in the display
    await expect(pageContext.getByTestId('author-name-display')).toHaveText('Updated Author Name')

    // Verify the change is also reflected in the projection
    await expect(pageContext.getByTestId('author-projection-name')).toContainText(
      'Updated Author Name',
    )

    // Test editing the player document
    const playerNameInput = pageContext.getByTestId('player-name-input')
    await playerNameInput.fill('Updated Player Name')
    await playerNameInput.press('Enter')

    // Verify the change is reflected in the display
    await expect(pageContext.getByTestId('player-name-display')).toHaveText('Updated Player Name')

    // Verify the change is also reflected in the projection
    await expect(pageContext.getByTestId('player-projection-name')).toContainText(
      'Updated Player Name',
    )

    // Test that external changes are reflected (simulating real-time updates)
    const authorClient = getClient(process.env['SDK_E2E_DATASET_0'])
    await authorClient.patch(`drafts.${authorId}`).set({name: 'Externally Updated Author'}).commit()

    // Test external change for player
    const playerClient = getClient(process.env['SDK_E2E_DATASET_1'])
    await playerClient.patch(`drafts.${playerId}`).set({name: 'Externally Updated Player'}).commit()

    // Verify external change is reflected
    await expect(async () => {
      const authorDisplay = await pageContext.getByTestId('author-name-display').textContent()
      const authorProjection = await pageContext.getByTestId('author-projection-name').textContent()
      expect(authorDisplay).toBe('Externally Updated Author')
      expect(authorProjection).toContain('Externally Updated Author')
    }).toPass({timeout: 5000})

    // Verify external change is reflected
    await expect(async () => {
      const playerDisplay = await pageContext.getByTestId('player-name-display').textContent()
      const playerProjection = await pageContext.getByTestId('player-projection-name').textContent()
      expect(playerDisplay).toBe('Externally Updated Player')
      expect(playerProjection).toContain('Externally Updated Player')
    }).toPass({timeout: 5000})
  })
})
