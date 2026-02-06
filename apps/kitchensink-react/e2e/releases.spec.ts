import {expect, test} from '@repo/e2e'
import {getVersionId} from 'sanity'

test.describe('Releases Route', () => {
  test('can create base documents and release versions', async ({
    page,
    getClient,
    createDocuments,
    getPageContext,
  }) => {
    const client = getClient()

    // First create the bestFriend author document so we can test references across docs
    const {
      documentIds: [bestFriendId],
    } = await createDocuments(
      [
        {
          _type: 'author',
          name: 'Base Best Friend',
        },
      ],
      {asDraft: false},
    )

    // Create the main test document
    const {
      documentIds: [testDocId],
    } = await createDocuments(
      [
        {
          _type: 'author',
          name: 'Base Test Author',
          bestFriend: {_type: 'reference', _ref: bestFriendId, _weak: true},
        },
      ],
      {asDraft: false},
    )

    await page.goto('./releases')
    const pageContext = await getPageContext(page)
    const heading = pageContext.getByText('Releases', {exact: true}).first()
    await expect(heading).toBeVisible({timeout: 30000})

    // Create the release
    const {releaseId} = await client.releases.create({
      metadata: {
        title: 'Test Release',
        releaseType: 'scheduled',
      },
    })

    // Create release version documents
    await createDocuments(
      [
        {
          _id: getVersionId(bestFriendId, releaseId),
          _type: 'author',
          name: 'Release Best Friend',
        },
        {
          _id: getVersionId(testDocId, releaseId),
          _type: 'author',
          name: 'Release Test Author',
          bestFriend: {_type: 'reference', _ref: bestFriendId, _weak: true},
        },
      ],
      {asDraft: false},
    )

    // Verify the release document exists and is being listened to live
    const autocompleteInput = pageContext.locator('input[placeholder="Type to find release …"]')
    await expect(autocompleteInput).toBeVisible()

    await autocompleteInput.click()
    await autocompleteInput.fill('Test')

    const releaseIdText = pageContext.getByText(`Release ID: ${releaseId}`)
    await expect(releaseIdText).toBeVisible({timeout: 10000})

    const releaseButton = pageContext.getByRole('button', {
      name: new RegExp(`Test Release.*Release ID: ${releaseId}`),
    })
    await expect(releaseButton).toBeVisible()
    await releaseButton.click()

    await expect(autocompleteInput).toHaveValue('Test Release', {timeout: 10000})

    const selectedPerspectiveHeading = pageContext.getByText('Selected Perspective')
    await expect(selectedPerspectiveHeading).toBeVisible()

    const releaseIdInPerspective = pageContext.getByText(releaseId).first()
    await expect(releaseIdInPerspective).toBeVisible({timeout: 10000})

    // Enter the test document ID in the "View Document across different perspectives" input
    const documentPerspectiveHeading = pageContext.getByText(
      'View Document across different perspectives',
    )
    await expect(documentPerspectiveHeading).toBeVisible()

    const documentIdInput = pageContext.locator('input[placeholder="Enter document ID"]')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(testDocId)
    await page.waitForTimeout(2000)

    const projectionCard = pageContext.getByTestId('document-projection-card')
    await projectionCard.scrollIntoViewIfNeeded()

    // Verify the projection also shows the release version
    await expect(async () => {
      const projectionContent = await projectionCard.textContent()
      expect(projectionContent).toContain('"bestFriend": "Release Best Friend"')
    }).toPass({timeout: 15000})

    await client.action([
      {
        actionType: 'sanity.action.document.edit',
        draftId: getVersionId(bestFriendId, releaseId),
        publishedId: bestFriendId,
        patch: {
          set: {
            name: 'Updated Release Best Friend',
          },
        },
      },
    ])

    await expect(async () => {
      const projectionContent = await projectionCard.textContent()
      expect(projectionContent).toContain('"bestFriend": "Updated Release Best Friend"')
    }).toPass({timeout: 20000, intervals: [2000, 3000, 5000]})

    await client.action([
      {
        actionType: 'sanity.action.document.edit',
        draftId: getVersionId(testDocId, releaseId),
        publishedId: testDocId,
        patch: {
          set: {
            name: 'Updated Release Test Author',
          },
        },
      },
    ])

    await expect(async () => {
      const projectionContent = await projectionCard.textContent()
      expect(projectionContent).toContain('"name": "Updated Release Test Author"')
    }).toPass({timeout: 20000, intervals: [2000, 3000, 5000]})
  })
})
