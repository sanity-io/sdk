import {type Page} from '@playwright/test'
import {expect, test} from '@repo/e2e'

/**
 * Reports what the presence socket actually did, so a failure says which of three
 * things went wrong: the socket never opened, it opened and was rejected, or it
 * connected and no peer was ever heard from.
 *
 * Without this, a failed assertion only says "nobody showed up", which is the same
 * symptom for all three.
 */
function tracePresenceSocket(page: Page, label: string): void {
  page.on('websocket', (ws) => {
    const url = ws.url()
    if (!url.includes('/socket/')) return

    // eslint-disable-next-line no-console
    console.log(`[${label}] socket open ${url}`)
    ws.on('socketerror', (error) => {
      // eslint-disable-next-line no-console
      console.log(`[${label}] socket error ${error}`)
    })
    ws.on('close', () => {
      // eslint-disable-next-line no-console
      console.log(`[${label}] socket closed`)
    })
    ws.on('framesent', ({payload}) => {
      const text = String(payload)
      if (text.includes('presence_')) {
        // eslint-disable-next-line no-console
        console.log(`[${label}] sent ${text.slice(0, 200)}`)
      }
    })
    ws.on('framereceived', ({payload}) => {
      const text = String(payload)
      // Skip the heartbeat, which is a bare U+2665 and would drown the log.
      if (text.length > 1 && !text.includes('welcome')) {
        // eslint-disable-next-line no-console
        console.log(`[${label}] recv ${text.slice(0, 200)}`)
      }
    })
  })

  // The dashboard emits a steady stream of font, Sentry, and CORS errors of its own,
  // which drown anything useful. Kept out so a real error is visible.
  const noise = /studio-static|sentry|Replay|bridge\.js|Failed to load resource/
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (noise.test(text)) return
    // eslint-disable-next-line no-console
    console.log(`[${label}] console error ${text.slice(0, 300)}`)
  })

  page.on('pageerror', (error) => {
    // eslint-disable-next-line no-console
    console.log(`[${label}] page error ${error.message.slice(0, 300)}`)
  })
}

/**
 * Presence is exercised across two browser tabs rather than two panes on one page.
 *
 * Presence stores are keyed by project and dataset and held in a module-level
 * registry, so two `SanityInstance`s in the same JavaScript realm share one store,
 * one socket, and one session id. Two panes would therefore be a single
 * participant, and every assertion here would pass without proving anything.
 * Separate tabs are separate realms, so they are genuinely separate sessions talking
 * over a real Bifur room.
 *
 * Both tabs are the same user, which is the ordinary "one person, two tabs" case.
 * Participants are counted by session, not by user.
 */
test.describe('Presence', () => {
  test('two sessions see each other in a document, down to the focused field', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Presence Subject'}], {
      asDraft: false,
    })
    const documentId = documentIds[0]
    const url = `./presence?documentId=${documentId}`

    tracePresenceSocket(page, 'first')
    await page.goto(url)
    const first = await getPageContext(page)
    await expect(first.getByTestId('presence-document-id')).toHaveText(documentId)

    // Alone to begin with: a client never sees its own session reported back.
    await expect(first.getByTestId('presence-document-empty')).toBeVisible()

    // A second tab in the same context, which is a separate JavaScript realm and so
    // a separate presence store, socket, and session id. Same user, second session.
    //
    // Deliberately not `browser.newContext()`: a manually created context does not
    // inherit the project's `use` options, and without the `x-vercel-protection-bypass`
    // headers the dashboard's app iframe stays sandboxed, scripts never execute, and
    // the app never renders at all.
    const secondPage = await page.context().newPage()
    tracePresenceSocket(secondPage, 'second')

    try {
      await secondPage.goto(url)
      const second = await getPageContext(secondPage)

      // Asserted on the peer's own reported id, which is what actually went over the
      // wire and came back, rather than on either tab's local display. Under the
      // default `drafts` perspective the SDK resolves to the draft.
      await expect(first.getByTestId('presence-participant-document-id')).toHaveText(
        `drafts.${documentId}`,
      )

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
      await secondPage.close()
    }

    // Closing the tab fires the disconnect on unload, so the peer goes away
    // promptly rather than lingering until the expiry sweep.
    await expect(first.getByTestId('presence-document-empty')).toBeVisible()
  })

  test('reading presence does not announce anything', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Reader Only'}], {
      asDraft: false,
    })
    const url = `./presence?documentId=${documentIds[0]}`

    tracePresenceSocket(page, 'reader')
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

    const secondPage = await page.context().newPage()
    tracePresenceSocket(secondPage, 'announcer')

    try {
      await secondPage.goto(url)
      const second = await getPageContext(secondPage)

      // The reader still sees the announcer.
      await expect(first.getByTestId('presence-document')).toHaveAttribute('data-count', '1')

      // The announcer never sees the reader.
      await expect(second.getByTestId('presence-document-empty')).toBeVisible()
    } finally {
      await secondPage.close()
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
