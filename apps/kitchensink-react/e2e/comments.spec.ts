import {type Page} from '@playwright/test'
import {expect, type PageContext, test} from '@repo/e2e'

/**
 * Comments do not live in the dataset under test. They live in a `comments`
 * add-on dataset paired to it, which does not exist until the first comment is
 * written. Every run gets a fresh dataset, so the first write in this file
 * provisions one, and the cleanup script deletes it alongside its parent.
 *
 * That provisioning is a discovery call and a setup call before the create even
 * starts, on top of a page load and a reload. The default 30s per test is not
 * enough for that on the slower browsers.
 */
test.describe.configure({timeout: 90_000})

/**
 * Waits for a write to reach Content Lake rather than just the screen.
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
      (response) => response.url().includes('/data/mutate/') && response.status() < 400,
      {timeout: 60_000},
    ),
    action(),
  ])
}

async function startThread(context: PageContext, message: string): Promise<void> {
  await context.getByTestId('comments-new-thread-input').fill(message)
  await context.getByTestId('comments-new-thread-submit').click()
}

async function reply(context: PageContext, message: string): Promise<void> {
  await context.getByTestId('thread-reply-input').fill(message)
  await context.getByTestId('thread-reply-submit').click()
}

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

    // The first write in this file, so this is the one that provisions the
    // add-on dataset.
    await settle(page, () => startThread(app, 'First thought'))

    await expect(app.getByTestId('thread')).toBeVisible()
    await expect(app.getByTestId('comment-message').first()).toHaveText('First thought')

    // A create that failed keeps the comment on screen carrying its error, so
    // the absence of that badge is what separates "written" from "displayed".
    await expect(app.getByText('createError')).toBeHidden()

    // The real proof: gone from memory, read back from the add-on dataset.
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

      // Nothing polls here. The second tab is holding a listener on the add-on
      // dataset and receives the mutation.
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

    await app.getByTestId('comments-field').selectOption('name')
    await settle(page, () => startThread(app, 'Rename this'))

    await expect(app.getByTestId('thread')).toBeVisible()
    await expect(app.getByTestId('thread-field')).toHaveText('name')

    // A full round trip: written, read back off the server, and still pointed at
    // the right document and field. The published id matters, since a comment
    // anchored to a draft id would be invisible from the published document.
    //
    // The written shape is not checked here. Comments are returned normalised,
    // so the cross dataset reference the Studio actually reads is no longer
    // visible through the public API. That is pinned instead by the payload test
    // in `commentActions.test.ts`, which asserts the whole `target` object
    // against what the client is handed.
    await app.getByTestId('comment-inspect').first().click()
    const stored = app.getByTestId('comment-json')
    await expect(stored).toContainText(`"documentId": "${documentId}"`)
    await expect(stored).toContainText('"fieldPath": "name"')
    await expect(stored).toContainText('"documentType": "author"')

    // Narrowing to the other field excludes it, which is the same filter an app
    // would use to put a count beside each input.
    await app.getByTestId('comments-field').selectOption('role')
    await expect(app.getByTestId('threads-empty')).toBeVisible()
  })
})
