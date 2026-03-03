import {expect, test} from '@repo/e2e'

test.describe('Document Projection', () => {
  test('can switch between different projection types and view data', async ({
    page,
    getClient,
    createDocuments,
    getPageContext,
  }) => {
    const client = getClient()

    // Create a book document first (needed for favoriteBooks reference)
    const {
      documentIds: [bookId],
    } = await createDocuments(
      [
        {
          _type: 'book',
          title: 'Test Book for Projection',
        },
      ],
      {asDraft: false},
    )

    // Create an author document with favoriteBooks and role
    const {
      documentIds: [authorId],
    } = await createDocuments(
      [
        {
          _type: 'author',
          name: 'Test Author Projection',
          favoriteBooks: [{_type: 'reference', _ref: bookId}],
          role: 'Senior Developer',
        },
      ],
      {asDraft: false},
    )

    // Update the author to reference itself as bestFriend
    await client
      .patch(authorId)
      .set({bestFriend: {_type: 'reference', _ref: authorId}})
      .commit()

    // Navigate to the document projection route
    await page.goto('./document-projection')

    // Get the page context for iframe/page detection
    const pageContext = await getPageContext(page)

    // Wait for the table to be visible
    const table = pageContext.getByTestId('projection-table')
    await table.waitFor()
    await expect(table).toBeVisible()

    // Wait for the author row to be visible
    const authorRow = pageContext.getByTestId(`author-row-${authorId}`)
    await authorRow.waitFor()
    await expect(authorRow).toBeVisible()

    // Test 1: Favorite Books Projection (default)
    const favoriteBooksButton = pageContext.getByRole('button', {name: 'Favorite Books'})
    await expect(favoriteBooksButton).toBeVisible()

    // Verify favorite books projection data is displayed
    const nameCell = pageContext.getByTestId(`projection-name-${authorId}`)
    await expect(nameCell).toContainText('Test Author Projection')

    const favoriteBooksCell = pageContext.getByTestId(`projection-favorite-books-${authorId}`)
    await expect(favoriteBooksCell).toBeVisible()
    // Should show the book title or "No favorite books"
    const favoriteBooksText = await favoriteBooksCell.textContent()
    expect(favoriteBooksText).toBeTruthy()

    // Test 2: Switch to Best Friend Projection
    const bestFriendButton = pageContext.getByRole('button', {name: 'Best Friend'})
    await bestFriendButton.click()

    // Wait for the projection to update
    await expect(async () => {
      const bestFriendCell = pageContext.getByTestId(`projection-best-friend-${authorId}`)
      await expect(bestFriendCell).toBeVisible()
    }).toPass({timeout: 10000})

    // Verify best friend projection data is displayed
    const bestFriendCell = pageContext.getByTestId(`projection-best-friend-${authorId}`)
    await expect(bestFriendCell).toBeVisible()

    const roleCell = pageContext.getByTestId(`projection-role-${authorId}`)
    await expect(roleCell).toBeVisible()
    await expect(roleCell).toContainText('Senior Developer')

    // Verify favorite books cell is no longer visible
    await expect(favoriteBooksCell).not.toBeVisible()

    // Test 3: Switch to Book Count (Groq Helper) Projection
    const bookCountButton = pageContext.getByRole('button', {name: 'Book Count'})
    await bookCountButton.click()

    // Wait for the projection to update
    await expect(async () => {
      const bookCountCell = pageContext.getByTestId(`projection-book-count-${authorId}`)
      await expect(bookCountCell).toBeVisible()
    }).toPass({timeout: 10000})

    // Verify book count projection data is displayed
    const bookCountCell = pageContext.getByTestId(`projection-book-count-${authorId}`)
    await expect(bookCountCell).toBeVisible()
    // Should show "1 books" or "0 books"
    const bookCountText = await bookCountCell.textContent()
    expect(bookCountText).toMatch(/\d+ books/)

    const hasBooksCell = pageContext.getByTestId(`projection-has-books-${authorId}`)
    await expect(hasBooksCell).toBeVisible()
    // Should show "Yes" or "No"
    const hasBooksText = await hasBooksCell.textContent()
    expect(['Yes', 'No']).toContain(hasBooksText)

    // Verify best friend and role cells are no longer visible
    await expect(bestFriendCell).not.toBeVisible()
    await expect(roleCell).not.toBeVisible()

    // Test 4: Switch back to Favorite Books Projection
    await favoriteBooksButton.click()

    // Wait for the projection to update
    await expect(async () => {
      const favoriteBooksCellAgain = pageContext.getByTestId(
        `projection-favorite-books-${authorId}`,
      )
      await expect(favoriteBooksCellAgain).toBeVisible()
    }).toPass({timeout: 10000})

    // Verify favorite books projection is displayed again
    const favoriteBooksCellAgain = pageContext.getByTestId(`projection-favorite-books-${authorId}`)
    await expect(favoriteBooksCellAgain).toBeVisible()

    // Verify book count cells are no longer visible
    await expect(bookCountCell).not.toBeVisible()
    await expect(hasBooksCell).not.toBeVisible()

    // Verify the name cell is still visible (should always be visible)
    await expect(nameCell).toBeVisible()
    await expect(nameCell).toContainText('Test Author Projection')
  })
})
