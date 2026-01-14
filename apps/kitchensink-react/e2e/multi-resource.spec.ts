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

    // Create a movie document in dataset 1
    const {
      documentIds: [movieId],
    } = await createDocuments(
      [
        {
          _type: 'movie',
          title: 'Test Movie Multi Resource',
          tmdb_id: 123456,
          release_date: '2021-01-01',
          hosted_poster_path: 'https://example.com/poster.jpg',
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
    await expect(pageContext.getByTestId(/^movie-document-/)).toBeVisible()

    // Verify author document content is displayed
    await expect(pageContext.getByTestId('author-name-display')).toHaveText(
      'Test Author Multi Resource',
    )

    // Verify movie document content is displayed
    await expect(pageContext.getByTestId('movie-name-display')).toHaveText(
      'Test Movie Multi Resource',
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

    // Test movie projection data
    await expect(pageContext.getByTestId('movie-projection-name')).toContainText(
      'Test Movie Multi Resource',
    )
    await expect(pageContext.getByTestId('movie-projection-release-date')).toContainText(
      '2021-01-01',
    )
    await expect(pageContext.getByTestId('movie-projection-has-poster')).toContainText('Yes')

    // Test editing the author document
    const authorNameInput = pageContext.getByTestId('author-name-input')
    await authorNameInput.fill('Updated Author Name')
    await authorNameInput.press('Enter')

    // Verify the change is reflected in both the display and projection
    // Check both together to ensure the mutation has fully propagated
    await expect(async () => {
      await expect(pageContext.getByTestId('author-name-display')).toHaveText('Updated Author Name')
      await expect(pageContext.getByTestId('author-projection-name')).toContainText(
        'Updated Author Name',
      )
    }).toPass({timeout: 20000})

    // Test editing the movie document
    const movieNameInput = pageContext.getByTestId('movie-name-input')
    await movieNameInput.fill('Updated Movie Name')
    await movieNameInput.press('Enter')

    // Verify the change is reflected in both the display and projection
    // Check both together to ensure the mutation has fully propagated
    await expect(async () => {
      await expect(pageContext.getByTestId('movie-name-display')).toHaveText('Updated Movie Name')
      await expect(pageContext.getByTestId('movie-projection-name')).toContainText(
        'Updated Movie Name',
      )
    }).toPass({timeout: 20000})

    // Test that external changes are reflected (simulating real-time updates)
    const authorClient = getClient(process.env['SDK_E2E_DATASET_0'])
    await authorClient.patch(`drafts.${authorId}`).set({name: 'Externally Updated Author'}).commit()

    // Test external change for movie
    const movieClient = getClient(process.env['SDK_E2E_DATASET_1'])
    await movieClient.patch(`drafts.${movieId}`).set({title: 'Externally Updated Movie'}).commit()

    // Verify external change is reflected
    // Increase timeout as external changes need to propagate via real-time subscriptions
    await expect(async () => {
      const authorDisplay = await pageContext.getByTestId('author-name-display').textContent()
      const authorProjection = await pageContext.getByTestId('author-projection-name').textContent()
      expect(authorDisplay).toBe('Externally Updated Author')
      expect(authorProjection).toContain('Externally Updated Author')
    }).toPass({timeout: 20000})

    // Verify external change is reflected
    // Increase timeout as external changes need to propagate via real-time subscriptions
    await expect(async () => {
      const movieDisplay = await pageContext.getByTestId('movie-name-display').textContent()
      const movieProjection = await pageContext.getByTestId('movie-projection-name').textContent()
      expect(movieDisplay).toBe('Externally Updated Movie')
      expect(movieProjection).toContain('Externally Updated Movie')
    }).toPass({timeout: 20000})
  })
})
