import {expect, test} from '@repo/e2e'

/**
 * Presence is exercised across two browser contexts rather than two panes on one
 * page.
 *
 * Presence stores are keyed by project and dataset and held in a module-level
 * registry, so two `SanityInstance`s in the same JavaScript realm share one store,
 * one socket, and one session id. Two panes would therefore be a single
 * participant, and every assertion here would pass without proving anything.
 * Separate contexts are separate realms, so they are genuinely separate sessions
 * talking over a real Bifur room.
 *
 * Both contexts are the same user, which is the ordinary "one person, two tabs"
 * case. Participants are counted by session, not by user.
 */
test.describe('Presence', () => {
  test('two sessions see each other in a document, down to the focused field', async ({
    page,
    browser,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Presence Subject'}], {
      asDraft: false,
    })
    const documentId = documentIds[0]
    const url = `./presence?documentId=${documentId}`

    await page.goto(url)
    const first = await getPageContext(page)
    await expect(first.getByTestId('presence-document-id')).toHaveText(documentId)

    // Alone to begin with: a client never sees its own session reported back.
    await expect(first.getByTestId('presence-document-empty')).toBeVisible()

    // A second context, authenticated as the same user from the same storage state
    // the project set up, so this is a second session rather than a second person.
    const secondContext = await browser.newContext({
      storageState: await page.context().storageState(),
    })
    const secondPage = await secondContext.newPage()

    try {
      await secondPage.goto(url)
      const second = await getPageContext(secondPage)

      // Each announces on mount, and each answers the other's roll call.
      await expect(first.getByTestId('presence-document')).toHaveAttribute('data-count', '1')
      await expect(second.getByTestId('presence-document')).toHaveAttribute('data-count', '1')

      // At the document root until a field is focused.
      await expect(first.getByTestId('presence-document-participant')).toContainText(
        'at the document root',
      )

      // Field level: the second session focuses a field, the first sees it against
      // that field and not against the other one.
      await second.getByTestId('presence-input-name').focus()
      await expect(first.getByTestId('presence-field-name')).toHaveAttribute('data-count', '1')
      await expect(first.getByTestId('presence-field-role')).toHaveAttribute('data-count', '0')

      // Moving between fields moves the indicator rather than accumulating.
      await second.getByTestId('presence-input-role').focus()
      await expect(first.getByTestId('presence-field-role')).toHaveAttribute('data-count', '1')
      await expect(first.getByTestId('presence-field-name')).toHaveAttribute('data-count', '0')

      // Still in the document, just no longer in a field.
      await second.getByTestId('presence-blur').click()
      await expect(first.getByTestId('presence-field-role')).toHaveAttribute('data-count', '0')
      await expect(first.getByTestId('presence-document')).toHaveAttribute('data-count', '1')
    } finally {
      await secondContext.close()
    }

    // Closing the tab fires the disconnect on unload, so the peer goes away
    // promptly rather than lingering until the expiry sweep.
    await expect(first.getByTestId('presence-document-empty')).toBeVisible()
  })

  test('reading presence does not announce anything', async ({
    page,
    browser,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Reader Only'}], {
      asDraft: false,
    })
    const url = `./presence?documentId=${documentIds[0]}`

    await page.goto(url)
    const first = await getPageContext(page)

    // Reading without writing, which is how an app that only displays presence
    // behaves. Announcing is opt-in, so switching it off must make this session
    // invisible while it carries on receiving everyone else.
    //
    // Clicked via the label rather than the input, because @sanity/ui hides the
    // real checkbox under a styled overlay and Playwright's actionability check
    // on the input itself is unreliable.
    await first.getByTestId('presence-announcing-label').click()
    await expect(first.getByTestId('presence-announcing')).not.toBeChecked()

    const secondContext = await browser.newContext({
      storageState: await page.context().storageState(),
    })
    const secondPage = await secondContext.newPage()

    try {
      await secondPage.goto(url)
      const second = await getPageContext(secondPage)

      // The reader still sees the announcer.
      await expect(first.getByTestId('presence-document')).toHaveAttribute('data-count', '1')

      // The announcer never sees the reader.
      await expect(second.getByTestId('presence-document-empty')).toBeVisible()
    } finally {
      await secondContext.close()
    }
  })

  test('defaults to a document without needing a query parameter', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    await createDocuments([{_type: 'author', name: 'Default Target'}], {asDraft: false})

    await page.goto('./presence')
    const context = await getPageContext(page)

    // Opening the route bare has to land on a real document, otherwise poking at
    // presence by hand means looking up an id first.
    await expect(context.getByTestId('presence-document-id')).not.toBeEmpty()
    await expect(context.getByTestId('presence-document')).toBeVisible()
  })
})
