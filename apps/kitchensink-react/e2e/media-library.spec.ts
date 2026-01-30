import {expect, test} from '@repo/e2e'

test.describe('Media Library', () => {
  test('can patch media library asset and see updates in useQuery and projection', async ({
    page,
    getPageContext,
    getMediaLibraryClient,
  }) => {
    // Navigate to the media library route
    await page.goto('./media-library')
    const pageContext = await getPageContext(page)

    // Wait for the query results to be visible
    const queryResultsElement = pageContext.getByTestId('query-results')
    await queryResultsElement.waitFor({timeout: 15000})

    const projectionResultsElement = pageContext.getByTestId('projection-results')
    await projectionResultsElement.waitFor({timeout: 15000})

    // Extract the JSON text from the query results
    const queryJsonText = await queryResultsElement.textContent()
    expect(queryJsonText).toBeTruthy()

    // Parse the JSON to get the query results
    const queryResults = JSON.parse(queryJsonText!)

    // Get the first asset's _id
    const firstAsset = queryResults[0]
    expect(firstAsset).toHaveProperty('_id')
    const assetId = firstAsset._id
    expect(assetId).toBeTruthy()

    // Verify the projection results are showing for the same asset
    const projectionJsonText = await projectionResultsElement.textContent()
    expect(projectionJsonText).toBeTruthy()
    const projectionData = JSON.parse(projectionJsonText!)
    expect(projectionData).toBeTruthy()

    // Create a media library client
    const mediaLibraryClient = getMediaLibraryClient()

    // Create a unique hash key for this test run (for parallel test execution)
    const testHash = `test_hash_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const testValue = 'test-value'

    // Patch the asset with an arbitrary value using a unique hash key, so we can check real-time updates in useQuery and projection.
    await mediaLibraryClient
      .patch(assetId)
      .set({arbitraryValues: {[testHash]: testValue}})
      .commit()

    // Wait for useQuery to update with the new value
    await expect(async () => {
      const updatedQueryText = await queryResultsElement.textContent()
      expect(updatedQueryText).toBeTruthy()

      const updatedQueryResults = JSON.parse(updatedQueryText!)
      const updatedAsset = updatedQueryResults.find((asset: {_id: string}) => asset._id === assetId)

      expect(updatedAsset).toBeTruthy()
      expect(updatedAsset.arbitraryValues).toBeTruthy()
      expect(updatedAsset.arbitraryValues[testHash]).toBe(testValue)
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
    await mediaLibraryClient
      .patch(assetId)
      .unset([`arbitraryValues.${testHash}`])
      .commit()
  })
})
