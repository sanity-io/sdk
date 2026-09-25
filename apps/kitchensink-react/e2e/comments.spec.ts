import {type Page} from '@playwright/test'
import {expect, type PageContext, test} from '@repo/e2e'

/**
 * Comments do not live in the dataset under test. They live in an organization
 * store, reached through `/collaboration/comments` and scoped to the dataset by
 * request parameters, so nothing has to be provisioned before the first write —
 * but every read and write needs `SANITY_APP_E2E_ORGANIZATION_ID` to name the
 * organization, and the comments API has to be enabled for it.
 *
 * Still generous on time: each test is a page load, several round trips, and
 * often a reload, which the default 30s does not cover on the slower browsers.
 */
test.describe.configure({timeout: 90_000})

/**
 * Waits for a write to reach the organization store rather than just the screen.
 *
 * Every comment action updates local state before the request goes out, so the
 * UI is already correct while the mutation is still in flight. Reloading at that
 * point aborts the request: the screen showed the change, the server never got
 * it, and the assertion after the reload fails. Anything that reloads, or that
 * depends on the server having agreed, has to settle first.
 */
async function settle(page: Page, action: () => Promise<void>): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/collaboration/comments') &&
        response.request().method() !== 'GET' &&
        response.status() < 400,
      {timeout: 60_000},
    ),
    action(),
  ])
}

/**
 * Every comment hangs off a field, so the target is always named. The picker is
 * separate from the filter above it: one control doing both once meant a new
 * thread silently attached to nothing.
 */
async function startThread(
  context: PageContext,
  message: string,
  field: string = 'name',
): Promise<void> {
  await context.getByTestId('comments-new-thread-field').selectOption(field)
  await context.getByTestId('comments-new-thread-input').fill(message)
  await context.getByTestId('comments-new-thread-submit').click()
}

async function reply(context: PageContext, message: string): Promise<void> {
  await context.getByTestId('thread-reply-input').fill(message)
  await context.getByTestId('thread-reply-submit').click()
}

/**
 * The Portable Text field the e2e fixtures seed, and the key of the block they
 * seed it with. An inline comment needs both: a range is offsets into a named
 * block, so it only resolves against content that is actually there.
 */
const PORTABLE_TEXT_FIELD = 'minimalBlock'
const BLOCK_KEY = 'b1'

const seededBlock = (text: string) => [
  {
    _type: 'block',
    _key: BLOCK_KEY,
    style: 'normal',
    markDefs: [],
    children: [{_type: 'span', _key: 's1', text, marks: []}],
  },
]

test.describe('Comments', () => {
  test('a thread survives a reload, then takes replies and edits', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Comment Subject'}], {
      asDraft: false,
    })
    const documentId = documentIds[0]

    await page.goto(`./comments?documentId=${documentId}`)
    const app = await getPageContext(page)
    await expect(app.getByTestId('comments-document-id')).toHaveText(documentId)
    await expect(app.getByTestId('threads-empty')).toBeVisible()

    await settle(page, () => startThread(app, 'First thought'))

    await expect(app.getByTestId('thread')).toBeVisible()
    await expect(app.getByTestId('comment-message').first()).toHaveText('First thought')

    // A create that failed keeps the comment on screen carrying its error, so
    // the absence of that badge is what separates "written" from "displayed".
    await expect(app.getByText('createError')).toBeHidden()

    // The real proof: gone from memory, read back from the organization store.
    await page.reload()
    const reloaded = await getPageContext(page)
    await expect(reloaded.getByTestId('thread')).toBeVisible()
    await expect(reloaded.getByTestId('comment-message').first()).toHaveText('First thought')

    await settle(page, () => reply(reloaded, 'Second thought'))
    await expect(reloaded.getByTestId('thread')).toHaveAttribute('data-count', '2')

    // Editing the parent leaves the reply alone.
    await settle(page, async () => {
      await reloaded.getByTestId('comment-edit-start').first().click()
      await reloaded.getByTestId('comment-edit-input').fill('First thought, revised')
      await reloaded.getByTestId('comment-edit-submit').click()
    })

    await expect(reloaded.getByTestId('comment-message').first()).toHaveText(
      'First thought, revised',
    )
    await expect(reloaded.getByTestId('comment-message').nth(1)).toHaveText('Second thought')
    await expect(reloaded.getByText('edited').first()).toBeVisible()
  })

  test('resolving carries the replies, and deleting the parent takes them too', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Resolve Subject'}], {
      asDraft: false,
    })
    await page.goto(`./comments?documentId=${documentIds[0]}`)
    const app = await getPageContext(page)

    await settle(page, () => startThread(app, 'Needs a decision'))
    await expect(app.getByTestId('thread')).toBeVisible()
    await settle(page, () => reply(app, 'Agreed'))
    await expect(app.getByTestId('thread')).toHaveAttribute('data-count', '2')

    // Settled before filtering: an unsettled status could still roll back, and
    // the filter below would then be reading a value the server never accepted.
    await settle(page, () => app.getByTestId('thread-toggle-status').click())

    // The whole thread moves, replies included. Filtering is by thread status,
    // which comes from the parent, so a reply left open would not show here.
    await app.getByTestId('comments-status').selectOption('open')
    await expect(app.getByTestId('threads-empty')).toBeVisible()

    await app.getByTestId('comments-status').selectOption('resolved')
    await expect(app.getByTestId('thread')).toHaveAttribute('data-count', '2')

    await app.getByTestId('comments-status').selectOption('all')
    await settle(page, () => app.getByTestId('comment-delete').first().click())

    // Deleting the first comment in a thread deletes its replies, so the whole
    // thread goes rather than leaving orphans behind.
    await expect(app.getByTestId('threads-empty')).toBeVisible()

    await page.reload()
    const reloaded = await getPageContext(page)
    await expect(reloaded.getByTestId('threads-empty')).toBeVisible()
  })

  test('a comment written in one tab reaches another', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Realtime Subject'}], {
      asDraft: false,
    })
    const url = `./comments?documentId=${documentIds[0]}`

    await page.goto(url)
    const first = await getPageContext(page)
    await expect(first.getByTestId('threads-empty')).toBeVisible()

    const secondPage = await page.context().newPage()

    try {
      await secondPage.goto(url)
      const second = await getPageContext(secondPage)
      await expect(second.getByTestId('threads-empty')).toBeVisible()

      await settle(page, () => startThread(first, 'Anyone there?'))

      // Nothing polls here. The second tab is holding a listener on the
      // organization store and receives the mutation.
      await expect(second.getByTestId('thread')).toBeVisible()
      await expect(second.getByTestId('comment-message').first()).toHaveText('Anyone there?')

      // And back the other way, into a thread the second tab did not create.
      await settle(secondPage, () => reply(second, 'Here'))
      await expect(first.getByTestId('thread')).toHaveAttribute('data-count', '2')
    } finally {
      await secondPage.close()
    }
  })

  test('a field comment records the path the Studio reads', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Field Subject'}], {
      asDraft: false,
    })
    const documentId = documentIds[0]
    await page.goto(`./comments?documentId=${documentId}`)
    const app = await getPageContext(page)

    await settle(page, () => startThread(app, 'Rename this', 'name'))

    await expect(app.getByTestId('thread')).toBeVisible()
    await expect(app.getByTestId('thread-field')).toHaveText('name')

    // A full round trip: written, read back off the server, and still pointed at
    // the right document and field. `documentId` is the published id the thread
    // hangs off, and `sourceDocumentId` the exact variant it was written
    // against, which is what the variant filters read.
    //
    // The written shape is not checked here. Comments are returned normalised,
    // so the global document reference the Studio actually reads is no longer
    // visible through the public API. That is pinned instead by the payload test
    // in `commentActions.test.ts`, which asserts the whole `target` object
    // against what the client is handed.
    await app.getByTestId('comment-inspect').first().click()
    const stored = app.getByTestId('comment-json')
    await expect(stored).toContainText(`"documentId": "${documentId}"`)
    await expect(stored).toContainText(`"sourceDocumentId": "${documentId}"`)
    await expect(stored).toContainText('"fieldPath": "name"')
    await expect(stored).toContainText('"documentType": "author"')

    // Narrowing to the other field excludes it, which is the same filter an app
    // would use to put a count beside each input.
    await app.getByTestId('comments-field').selectOption('role')
    await expect(app.getByTestId('threads-empty')).toBeVisible()
  })

  test('a reaction goes on and comes off again', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments([{_type: 'author', name: 'Reaction Subject'}], {
      asDraft: false,
    })
    await page.goto(`./comments?documentId=${documentIds[0]}`)
    const app = await getPageContext(page)

    await settle(page, () => startThread(app, 'React to this'))
    await expect(app.getByTestId('thread')).toBeVisible()

    const thumbsUp = app.getByTestId('comment-reaction-+1').first()
    await expect(thumbsUp).toHaveAttribute('data-count', '0')

    await settle(page, () => thumbsUp.click())
    await expect(thumbsUp).toHaveAttribute('data-count', '1')
    // The reaction is recorded against the user who added it, which is what
    // makes the button a toggle rather than a counter.
    await expect(thumbsUp).toHaveAttribute('data-mine', 'true')

    // Survives a reload, so it reached the organization store rather than only
    // the optimistic copy.
    await page.reload()
    const reloaded = await getPageContext(page)
    const reloadedThumbsUp = reloaded.getByTestId('comment-reaction-+1').first()
    await expect(reloadedThumbsUp).toHaveAttribute('data-count', '1')

    await settle(page, () => reloadedThumbsUp.click())
    await expect(reloadedThumbsUp).toHaveAttribute('data-count', '0')
    await expect(reloadedThumbsUp).toHaveAttribute('data-mine', 'false')
  })

  test('an inline comment resolves a selection, and can be re-anchored', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {documentIds} = await createDocuments(
      [
        {
          _type: 'author',
          name: 'Inline Subject',
          [PORTABLE_TEXT_FIELD]: seededBlock('Hello World again'),
        },
      ],
      {asDraft: false},
    )
    await page.goto(`./comments?documentId=${documentIds[0]}`)
    const app = await getPageContext(page)

    // Offsets 6 to 11 cover "World" in the seeded block.
    await app.getByTestId('comments-new-thread-field').selectOption(PORTABLE_TEXT_FIELD)
    await app.getByTestId('comments-range-key').fill(BLOCK_KEY)
    await app.getByTestId('comments-range-start').fill('6')
    await app.getByTestId('comments-range-end').fill('11')
    await settle(page, () => startThread(app, 'This word', PORTABLE_TEXT_FIELD))

    await expect(app.getByTestId('thread')).toBeVisible()

    // The range itself is not stored. The API resolves it against the document
    // into a selection — the block's text with the selected part marked — plus a
    // snapshot of what was selected, so that is what comes back.
    await app.getByTestId('comment-inspect').first().click()
    const stored = app.getByTestId('comment-json')
    await expect(stored).toContainText('"selection"')
    await expect(stored).toContainText('"contentSnapshot"')
    await expect(stored).toContainText('World')

    // Re-anchoring is a mechanical move, so it must not mark the comment edited
    // the way rewriting the message does.
    await settle(page, () => app.getByTestId('comment-reanchor').first().click())
    await expect(app.getByText('edited')).toBeHidden()

    // Clearing the anchor leaves a plain field comment behind.
    await settle(page, () => app.getByTestId('comment-clear-anchor').first().click())
    await expect(app.getByTestId('comment-reanchor')).toBeHidden()
    await expect(app.getByTestId('thread-field')).toHaveText(PORTABLE_TEXT_FIELD)
  })
})
