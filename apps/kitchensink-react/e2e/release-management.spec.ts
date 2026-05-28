import {expect, test} from '@repo/e2e'
import {ReleaseDocument} from '@sanity/sdk'

const releaseQuery = `*[_id == $id][0]`

test.describe('Release Management Dialog', () => {
  test('creates, edits, schedules, unschedules, publishes, and deletes a release through the dialog', async ({
    page,
    getClient,
    getPageContext,
  }) => {
    const client = getClient()

    // Randomized to allow parallel e2e runs against the same dataset.
    const releaseId = `e2e-${Math.random().toString(36).slice(2, 9)}`
    const title = `E2E ${releaseId}`
    const initialDescription = 'Initial description'
    const editedDescription = 'Edited description'

    try {
      await page.goto('./releases')
      const pageContext = await getPageContext(page)
      await expect(pageContext.getByText('Releases', {exact: true}).first()).toBeVisible({
        timeout: 30000,
      })

      // --- 1. CREATE via the dialog -----------------------------------------
      await pageContext.getByRole('button', {name: 'Create release', exact: true}).click()

      const idInput = pageContext.getByTestId('release-id-input')
      await expect(idInput).toBeVisible({timeout: 10000})
      await idInput.fill(releaseId)
      await pageContext.getByTestId('release-title-input').fill(title)
      await pageContext.getByTestId('release-description-input').fill(initialDescription)
      await pageContext.getByTestId('release-type-select').selectOption('undecided')

      await pageContext.getByTestId('release-create-submit').click()

      // Verify through the client that the release actually exists server-side.
      await expect(async () => {
        const doc = await client.fetch<ReleaseDocument | null>(
          releaseQuery,
          {id: `_.releases.${releaseId}`},
          {perspective: 'raw'},
        )
        expect(doc?._id).toBe(`_.releases.${releaseId}`)
        expect(doc?.metadata?.title).toBe(title)
        expect(doc?.metadata?.description).toBe(initialDescription)
      }).toPass({timeout: 20000, intervals: [500, 1000, 2000]})

      // Dialog closes after create; route auto-selects the new release.
      await expect(idInput).not.toBeVisible({timeout: 10000})

      // --- 2. EDIT description --------------------------------------------
      // Wait for the route to switch perspective to the new release and
      // surface the "Edit release" button on the selected release card.
      const editButton = pageContext.getByRole('button', {name: 'Edit release', exact: true})
      await expect(editButton).toBeVisible({timeout: 30000})
      await editButton.click()

      const descInput = pageContext.getByTestId('release-description-input')
      await expect(descInput).toBeVisible({timeout: 10000})
      await descInput.fill(editedDescription)
      await pageContext.getByTestId('release-edit-submit').click()

      await expect(pageContext.getByTestId('release-action-status')).toContainText(
        'Edit release succeeded',
        {timeout: 15000},
      )

      // --- 3. SCHEDULE ------------------------------------------------------
      // Pick a publish time 1 hour in the future.
      const future = new Date(Date.now() + 60 * 60 * 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      const datetimeLocal =
        `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}` +
        `T${pad(future.getHours())}:${pad(future.getMinutes())}`
      await pageContext.getByTestId('release-intended-publish-at-input').fill(datetimeLocal)

      await pageContext.getByTestId('release-schedule-action').click()
      await expect(pageContext.getByTestId('release-action-status')).toContainText(
        'Schedule release succeeded',
        {timeout: 15000},
      )

      // Verify server-side state and that the description edit persisted.
      await expect(async () => {
        const doc = await client.fetch<ReleaseDocument | null>(
          releaseQuery,
          {id: `_.releases.${releaseId}`},
          {perspective: 'raw'},
        )
        expect(doc?.state).toBe('scheduled')
        expect(doc?.metadata?.description).toBe(editedDescription)
      }).toPass({timeout: 20000, intervals: [1000, 2000, 3000]})

      // Wait for the dialog to reflect the scheduled state before unscheduling.
      await expect(pageContext.getByTestId('release-state-display')).toContainText('scheduled', {
        timeout: 15000,
      })

      // --- 4. UNSCHEDULE ----------------------------------------------------
      await pageContext.getByTestId('release-unschedule-action').click()
      await expect(pageContext.getByTestId('release-action-status')).toContainText(
        'Unschedule release succeeded',
        {timeout: 15000},
      )
      await expect(pageContext.getByTestId('release-state-display')).toContainText('active', {
        timeout: 15000,
      })

      // --- 5. PUBLISH -------------------------------------------------------
      await pageContext.getByTestId('release-publish-action').click()
      await expect(pageContext.getByTestId('release-action-status')).toContainText(
        'Publish release succeeded',
        {timeout: 15000},
      )

      await expect(async () => {
        const doc = await client.fetch<ReleaseDocument | null>(
          releaseQuery,
          {id: `_.releases.${releaseId}`},
          {perspective: 'raw'},
        )
        expect(doc?.state).toBe('published')
      }).toPass({timeout: 30000, intervals: [1000, 2000, 3000]})

      // Wait for the dialog's local state to catch up so Delete is enabled.
      await expect(pageContext.getByTestId('release-state-display')).toContainText('published', {
        timeout: 30000,
      })

      // --- 6. DELETE --------------------------------------------------------
      await pageContext.getByTestId('release-delete-action').click()

      await expect(async () => {
        const doc = await client.fetch<ReleaseDocument | null>(
          releaseQuery,
          {id: `_.releases.${releaseId}`},
          {perspective: 'raw'},
        )
        expect(doc).toBeNull()
      }).toPass({timeout: 20000, intervals: [1000, 2000, 3000]})
    } finally {
      // Best-effort cleanup. Release may already be deleted (happy path) or
      // be in any state if the test failed midway. Swallow errors so cleanup
      // doesn't mask a real test failure.
      try {
        const existing = await client
          .fetch<ReleaseDocument | null>(
            releaseQuery,
            {id: `_.releases.${releaseId}`},
            {perspective: 'raw'},
          )
          .catch(() => null)
        if (existing) {
          if (existing.state !== 'archived' && existing.state !== 'published') {
            await client.action([{actionType: 'sanity.action.release.archive', releaseId}])
          }
          await client.action([{actionType: 'sanity.action.release.delete', releaseId}])
        }
      } catch {
        // ignore
      }
    }
  })
})
