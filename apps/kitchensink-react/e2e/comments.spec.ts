import {expect, type PageContext, test} from '@repo/e2e'

/**
 * Comments do not live in the dataset under test. They live in a `comments`
 * add-on dataset paired to it, which does not exist until the first comment is
 * written. Every run gets a fresh dataset, so the first write in each of these
 * specs provisions one, and the cleanup script deletes it alongside its parent.
 *
 * That provisioning is a discovery call plus a setup call before the create,
 * which is why the first assertion that requires a server round trip is given
 * room rather than the default timeout.
 */
const FIRST_WRITE_TIMEOUT = 30_000

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
    const url = `./comments?documentId=${documentId}`

    await page.goto(url)
    const app = await getPageContext(page)
    await expect(app.getByTestId('comments-document-id')).toHaveText(documentId)
    await expect(app.getByTestId('threads-empty')).toBeVisible()

    await startThread(app, 'First thought')

    // Shown before the server confirms it, so this says nothing about the write
    // yet.
    await expect(app.getByTestId('thread')).toBeVisible()
    await expect(app.getByTestId('comment-message').first()).toHaveText('First thought')

    // A create that failed keeps the comment on screen carrying its error, so
    // the absence of that badge is what separates "written" from "displayed".
    await expect(app.getByText('createError')).toBeHidden()

    // The real proof: gone from memory, read back from the add-on dataset. This
    // is also what proves provisioning worked.
    await page.reload()
    const reloaded = await getPageContext(page)
    await expect(reloaded.getByTestId('thread')).toBeVisible({timeout: FIRST_WRITE_TIMEOUT})
    await expect(reloaded.getByTestId('comment-message').first()).toHaveText('First thought')

    await reply(reloaded, 'Second thought')
    await expect(reloaded.getByTestId('thread')).toHaveAttribute('data-count', '2')

    // Editing the parent leaves the reply alone.
    await reloaded.getByTestId('comment-edit-start').first().click()
    await reloaded.getByTestId('comment-edit-input').fill('First thought, revised')
    await reloaded.getByTestId('comment-edit-submit').click()

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

    await startThread(app, 'Needs a decision')
    await expect(app.getByTestId('thread')).toBeVisible({timeout: FIRST_WRITE_TIMEOUT})
    await reply(app, 'Agreed')
    await expect(app.getByTestId('thread')).toHaveAttribute('data-count', '2')

    await app.getByTestId('thread-toggle-status').click()

    // The whole thread moves, replies included. Filtering is by thread status,
    // which comes from the parent, so a reply left open would not show here.
    await app.getByTestId('comments-status').selectOption('open')
    await expect(app.getByTestId('threads-empty')).toBeVisible()

    await app.getByTestId('comments-status').selectOption('resolved')
    await expect(app.getByTestId('thread')).toHaveAttribute('data-count', '2')

    await app.getByTestId('comments-status').selectOption('all')
    await app.getByTestId('comment-delete').first().click()

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

      await startThread(first, 'Anyone there?')

      // Nothing polls here. The second tab is holding a listener on the add-on
      // dataset and receives the mutation.
      await expect(second.getByTestId('thread')).toBeVisible({timeout: FIRST_WRITE_TIMEOUT})
      await expect(second.getByTestId('comment-message').first()).toHaveText('Anyone there?')

      // And back the other way, into a thread the second tab did not create.
      await reply(second, 'Here')
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
    await startThread(app, 'Rename this')

    await expect(app.getByTestId('thread')).toBeVisible({timeout: FIRST_WRITE_TIMEOUT})
    await expect(app.getByTestId('thread-field')).toHaveText('name')

    // The stored document is the interop contract. The Studio finds a comment by
    // `target.document._ref` and groups it by `target.path.field`, and reaches
    // across datasets to do it, so all three have to be right or the comment is
    // invisible there while looking fine here.
    await app.getByTestId('comment-inspect').first().click()
    const stored = app.getByTestId('comment-json')
    await expect(stored).toContainText('"_type": "crossDatasetReference"')
    await expect(stored).toContainText(`"_ref": "${documentId}"`)
    await expect(stored).toContainText('"field": "name"')

    // Narrowing to the other field excludes it, which is the same filter an app
    // would use to put a count beside each input.
    await app.getByTestId('comments-field').selectOption('role')
    await expect(app.getByTestId('threads-empty')).toBeVisible()
  })
})
