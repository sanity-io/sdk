import {expect, test} from '@repo/e2e'

test.describe('Canvas', () => {
  test('can patch canvas document and see updates in useQuery and projection', async ({
    page,
    getPageContext,
    getCanvasClient,
  }) => {
    // Navigate to the canvas route
    await page.goto('./canvas')
    const pageContext = await getPageContext(page)

    // Wait for the query results to be visible
    const queryResultsElement = pageContext.getByTestId('query-results')
    await queryResultsElement.waitFor({timeout: 15000})

    const projectionResultsElement = pageContext.getByTestId('projection-results')
    await projectionResultsElement.waitFor({timeout: 15000})

    const previewResultsElement = pageContext.getByTestId('preview-results')
    await previewResultsElement.waitFor({timeout: 15000})

    // Extract the JSON text from the query results
    const queryJsonText = await queryResultsElement.textContent()
    expect(queryJsonText).toBeTruthy()

    // Parse the JSON to get the query results
    const queryResults = JSON.parse(queryJsonText!)

    // Get the first document's _id
    const firstDocument = queryResults[0]
    expect(firstDocument).toHaveProperty('_id')
    const documentId = firstDocument._id
    expect(documentId).toBeTruthy()

    // Verify the projection results are showing for the same document
    const projectionJsonText = await projectionResultsElement.textContent()
    expect(projectionJsonText).toBeTruthy()
    const projectionData = JSON.parse(projectionJsonText!)
    expect(projectionData).toBeTruthy()

    // Verify the preview results are showing
    const previewJsonText = await previewResultsElement.textContent()
    expect(previewJsonText).toBeTruthy()
    const previewData = JSON.parse(previewJsonText!)
    expect(previewData).toBeTruthy()
    expect(previewData).toHaveProperty('title')

    // Create a canvas client
    const canvasClient = getCanvasClient()

    // Create a unique hash key for this test run (for parallel test execution)
    const testHash = `test_hash_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const testValue = 'test-value'

    // Patch the document with an arbitrary value using a unique hash key, so we can check real-time updates in useQuery and projection.
    await canvasClient
      .patch(documentId)
      .set({arbitraryValues: {[testHash]: testValue}})
      .commit()

    // Wait for useQuery to update with the new value
    await expect(async () => {
      const updatedQueryText = await queryResultsElement.textContent()
      expect(updatedQueryText).toBeTruthy()

      const updatedQueryResults = JSON.parse(updatedQueryText!)
      const updatedDocument = updatedQueryResults.find(
        (doc: {_id: string}) => doc._id === documentId,
      )

      expect(updatedDocument).toBeTruthy()
      expect(updatedDocument.arbitraryValues).toBeTruthy()
      expect(updatedDocument.arbitraryValues[testHash]).toBe(testValue)
    }).toPass({timeout: 10000})

    // Wait for projection to update with the new value
    await expect(async () => {
      const updatedProjectionText = await projectionResultsElement.textContent()
      expect(updatedProjectionText).toBeTruthy()

      const updatedProjectionData = JSON.parse(updatedProjectionText!)

      expect(updatedProjectionData).toBeTruthy()
      expect(updatedProjectionData.arbitraryValues).toBeTruthy()
      expect(updatedProjectionData.arbitraryValues[testHash]).toBe(testValue)
    }).toPass({timeout: 10000})

    // Cleanup: Remove the test hash from arbitrary values
    await canvasClient
      .patch(documentId)
      .unset([`arbitraryValues.${testHash}`])
      .commit()
  })
})
