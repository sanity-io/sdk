import {expect, test} from '@repo/e2e'

/**
 * A session that expires in the middle of typing, against the real backend and
 * the real Portable Text editor. While the session is expired every write gets
 * the 401 the actions API returns for an expired session; then the session
 * comes back. The typed text has to stay in the editor while the writes fail
 * and has to reach the server once they succeed. When failed writes were
 * reverted, the editor replaced its content with the server copy about a
 * second after each 401, so the text vanished and was never saved.
 */

const TYPED = ' kept while the session was expired'

function plainText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return (blocks as Array<{children?: Array<{text?: string}>}>)
    .map((block) => (block.children ?? []).map((span) => span.text ?? '').join(''))
    .join('\n')
}

test.describe('Portable Text editing across an expired session', () => {
  test('text typed while writes return 401 stays in the editor and is saved once the session is back', async ({
    page,
    createDocuments,
    getClient,
    getPageContext,
  }) => {
    // ~2s of typing, 3s held, then up to one 10s retry backoff and the echo
    test.setTimeout(90_000)

    const {
      documentIds: [id],
    } = await createDocuments([
      {
        _type: 'author',
        name: 'PTE session expiry test author',
        minimalBlock: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [{_type: 'span', _key: 's1', text: 'Start:', marks: []}],
          },
        ],
      },
    ])

    await page.goto('./portable-text')
    const pageContext = await getPageContext(page)
    await pageContext.getByTestId('pte-document-id-input').fill(id)
    await pageContext.getByTestId('pte-load-button').click()

    const editableA = pageContext.getByTestId('pte-editable-a')
    await expect(editableA).toContainText('Start:')

    // The preview shows the document store's local value. The server copy is
    // read with the e2e client, which runs outside the page, so the route
    // below doesn't touch it. (Both panes share one document store per
    // resource, so pane B's preview is local state too.)
    const readLocalCopy = async () =>
      plainText(
        JSON.parse((await pageContext.getByTestId('pte-preview-a').textContent()) || 'null'),
      )
    const readServerCopy = async () =>
      plainText(
        await getClient().fetch(
          '*[_id == $id][0].minimalBlock',
          // createDocuments returns the bare ID and creates the document as a draft
          {id: `drafts.${id}`},
          {perspective: 'raw'},
        ),
      )

    // caret at the end of the seed text
    await editableA.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('ControlOrMeta+a')
    await page.waitForTimeout(150)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)

    let rejectedWrites = 0
    const expireSession: Parameters<typeof page.route>[1] = async (route) => {
      const request = route.request()
      const headers = {
        'access-control-allow-origin': request.headers()['origin'] ?? '*',
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers':
          request.headers()['access-control-request-headers'] ?? 'authorization, content-type',
      }
      if (request.method() === 'OPTIONS') {
        await route.fulfill({status: 204, headers})
        return
      }
      rejectedWrites++
      await route.fulfill({
        status: 401,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Session not found',
        }),
      })
    }
    await page.route('**/data/actions/**', expireSession)

    await page.keyboard.type(TYPED, {delay: 40})
    await expect.poll(() => rejectedWrites).toBeGreaterThan(0)

    // well past the editor plugin's 1s repair window after a reverted write
    await page.waitForTimeout(3000)
    await expect(editableA).toContainText(`Start:${TYPED}`)
    expect(await readLocalCopy()).toBe(`Start:${TYPED}`)
    expect(await readServerCopy()).toBe('Start:')

    // the session is back: the held writes go through on the next retry
    await page.unroute('**/data/actions/**', expireSession)
    await expect.poll(readServerCopy, {timeout: 20_000}).toBe(`Start:${TYPED}`)
    expect(await readLocalCopy()).toBe(`Start:${TYPED}`)
    await expect(editableA).toContainText(`Start:${TYPED}`)
  })
})
