import {expect, test} from '@repo/e2e'

/**
 * Concurrent Portable Text editing through the patch channel, end to end:
 * two editor panes on independent SanityInstances edit the same document
 * field, so every edit round-trips through the real Content Lake listener.
 *
 * The deterministic collision matrix lives in the editor repo
 * (@portabletext/plugin-sdk-value browser tests); this spec is the drift
 * detector against the real backend and the published package versions the
 * kitchensink installs.
 */

const FIELD_SEED = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [],
    children: [{_type: 'span', _key: 's1', text: 'alpha', marks: []}],
  },
  {
    _type: 'block',
    _key: 'b2',
    style: 'normal',
    markDefs: [],
    children: [{_type: 'span', _key: 's2', text: 'omega', marks: []}],
  },
]

interface PortableTextSpan {
  _type?: string
  text?: string
  marks?: string[]
  children?: unknown
}

interface PortableTextBlockShape {
  _type?: string
  markDefs?: Array<{_key?: string; _type?: string}>
  children?: PortableTextSpan[]
}

/**
 * Structural Portable Text validity: no orphan marks, no spans carrying
 * children, no inline link objects. Mirrors the corruption signal in the
 * plugin's collision matrix.
 */
function validatePortableText(blocks: unknown): string[] {
  const problems: string[] = []
  if (!Array.isArray(blocks)) return ['value is not an array']
  for (const block of blocks as PortableTextBlockShape[]) {
    if (!block || typeof block !== 'object') {
      problems.push('non-object block')
      continue
    }
    if (block._type !== 'block') continue
    const markDefKeys = new Set((block.markDefs ?? []).map((def) => def && def._key))
    for (const child of block.children ?? []) {
      if (!child || typeof child !== 'object') {
        problems.push('non-object child')
        continue
      }
      if (child._type === 'link') problems.push('inline link child')
      if (child._type === 'span') {
        if (Array.isArray(child.children)) problems.push('span has children[]')
        for (const mark of child.marks ?? []) {
          if (mark !== 'strong' && mark !== 'em' && !markDefKeys.has(mark)) {
            problems.push(`orphan mark "${mark}"`)
          }
        }
      }
    }
  }
  return [...new Set(problems)]
}

function textOf(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return (blocks as PortableTextBlockShape[])
    .map((block) => (block.children ?? []).map((child) => child.text ?? '').join(''))
    .join('\n')
}

test.describe('Portable Text concurrent editing', () => {
  test('edits from two clients interleave without data loss', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {
      documentIds: [id],
    } = await createDocuments([
      {
        _type: 'author',
        name: 'PTE concurrency test author',
        minimalBlock: FIELD_SEED,
      },
    ])

    await page.goto('./portable-text')
    const pageContext = await getPageContext(page)

    const documentIdInput = pageContext.getByTestId('pte-document-id-input')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(id.replace('drafts.', ''))
    await pageContext.getByTestId('pte-load-button').click()

    const editableA = pageContext.getByTestId('pte-editable-a')
    const editableB = pageContext.getByTestId('pte-editable-b')
    await expect(editableA).toContainText('alpha')
    await expect(editableB).toContainText('omega')

    // Concurrent edits: client A types into block 1 while client B types
    // into block 2. Both land within the sync round-trip window, so the
    // server has to merge them. The caret lands wherever the click hits
    // (End is unreliable across browsers), which is fine: the guarantee
    // under test is that both edits survive, not where they land.
    await editableA.getByText('alpha').click()
    await page.keyboard.type(' oneA ')

    await editableB.getByText('omega').click()
    await page.keyboard.type(' twoB ')

    // Both panes converge on the same value containing both edits.
    await expect(async () => {
      const previewA = JSON.parse(
        (await pageContext.getByTestId('pte-preview-a').textContent()) || 'null',
      )
      const previewB = JSON.parse(
        (await pageContext.getByTestId('pte-preview-b').textContent()) || 'null',
      )
      expect(previewA).toEqual(previewB)
      expect(textOf(previewA)).toContain('oneA')
      expect(textOf(previewA)).toContain('twoB')
      expect(validatePortableText(previewA)).toEqual([])
    }).toPass({timeout: 20000})

    // The editors themselves converge too (no frozen panes).
    await expect(editableA).toContainText('oneA')
    await expect(editableA).toContainText('twoB')
    await expect(editableB).toContainText('oneA')
    await expect(editableB).toContainText('twoB')
  })

  test('a single user typing with delete-and-retype bursts loses nothing', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    // The gesture alone takes ~25s (human-cadence typing with pauses that
    // straddle the ~1s flush window), plus a 20s convergence assertion.
    test.setTimeout(120_000)
    // Field regression: one user typing alone (no collaboration) saw text
    // duplicated and reordered, most visibly after backspacing a few
    // characters and retyping them. The concurrent tests above never catch
    // this because they type in short discrete bursts and settle; this
    // gesture has to straddle the plugin's ~1s mutation flush window.
    // Fixed in @portabletext/plugin-sdk-value 7.1.1 (portabletext/editor#2986).
    const {
      documentIds: [id],
    } = await createDocuments([
      {
        _type: 'author',
        name: 'PTE solo typing test author',
        minimalBlock: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [{_type: 'span', _key: 's1', text: 'Start: ', marks: []}],
          },
        ],
      },
    ])

    await page.goto('./portable-text')
    const pageContext = await getPageContext(page)

    const documentIdInput = pageContext.getByTestId('pte-document-id-input')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(id.replace('drafts.', ''))
    await pageContext.getByTestId('pte-load-button').click()

    const editableA = pageContext.getByTestId('pte-editable-a')
    // Wait for the sync plugin to seed the EDITOR (not just the store
    // preview) before typing: keystrokes that land before the initial value
    // sync get merged against the seed and end up split across blocks. The
    // non-empty seed text is what makes editor readiness observable.
    await expect(editableA).toContainText('Start:')

    // Deterministic caret at the very end (select-all + ArrowRight collapses
    // to the end; the End key is unreliable across browsers). The pauses
    // matter: select-all racing the editor's selection handling can leave
    // the whole seed selected, and the first keystroke then replaces it.
    await editableA.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('ControlOrMeta+a')
    await page.waitForTimeout(150)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)

    // Type into pane A only, mirroring every keystroke into an expected
    // model. Pauses are sampled around the flush cadence so deletes and
    // retypes land on both sides of a flush boundary.
    let expected = 'Start: '
    const type = async (text: string) => {
      await page.keyboard.type(text, {delay: 40})
      expected += text
    }
    const backspace = async (count: number) => {
      for (let i = 0; i < count; i++) {
        await page.keyboard.press('Backspace')
        await page.waitForTimeout(30)
      }
      expected = expected.slice(0, -count)
    }
    const pause = (ms: number) => page.waitForTimeout(ms)

    await type('publish editors ')
    await pause(400)
    await type('deadline ')
    await backspace(5)
    await pause(1100)
    await type('line ')
    await pause(300)
    await type('sources ')
    await backspace(8)
    await pause(900)
    await type('sources ')
    await type('context')
    await pause(150)
    await backspace(3)
    await pause(1100)
    await type('ext')

    // Both panes and the stored value must equal exactly what was typed:
    // no duplicated suffixes, no resurrected deletions, no reordering.
    await expect(async () => {
      const previewA = JSON.parse(
        (await pageContext.getByTestId('pte-preview-a').textContent()) || 'null',
      )
      const previewB = JSON.parse(
        (await pageContext.getByTestId('pte-preview-b').textContent()) || 'null',
      )
      expect(textOf(previewA)).toBe(expected)
      expect(previewA).toEqual(previewB)
      expect(validatePortableText(previewA)).toEqual([])
    }).toPass({timeout: 20000})
  })

  test('concurrent formatting and typing converge to valid Portable Text', async ({
    page,
    createDocuments,
    getPageContext,
  }) => {
    const {
      documentIds: [id],
    } = await createDocuments([
      {
        _type: 'author',
        name: 'PTE formatting conflict test author',
        minimalBlock: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            markDefs: [],
            children: [{_type: 'span', _key: 's1', text: 'The quick brown fox', marks: []}],
          },
        ],
      },
    ])

    await page.goto('./portable-text')
    const pageContext = await getPageContext(page)

    const documentIdInput = pageContext.getByTestId('pte-document-id-input')
    await expect(documentIdInput).toBeVisible()
    await documentIdInput.fill(id.replace('drafts.', ''))
    await pageContext.getByTestId('pte-load-button').click()

    const editableA = pageContext.getByTestId('pte-editable-a')
    const editableB = pageContext.getByTestId('pte-editable-b')
    await expect(editableA).toContainText('The quick brown fox')
    await expect(editableB).toContainText('The quick brown fox')

    // Client A bolds the whole line while client B appends text to the same
    // span. This is the hardest collision class (formatting splits the span
    // another client is typing into); the guarantee is convergence to valid
    // Portable Text, not that every keystroke survives.
    await editableA.getByText('The quick brown fox').click()
    await page.keyboard.press('ControlOrMeta+a')
    await pageContext.getByTestId('pte-bold-a').click()

    await editableB.getByText('The quick brown fox').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' jumps')

    await expect(async () => {
      const previewA = JSON.parse(
        (await pageContext.getByTestId('pte-preview-a').textContent()) || 'null',
      )
      const previewB = JSON.parse(
        (await pageContext.getByTestId('pte-preview-b').textContent()) || 'null',
      )
      expect(previewA).toEqual(previewB)
      expect(validatePortableText(previewA)).toEqual([])
      // the bold formatting survives on at least one span
      const hasStrong = (previewA as PortableTextBlockShape[]).some((block) =>
        (block.children ?? []).some((child) => (child.marks ?? []).includes('strong')),
      )
      expect(hasStrong).toBe(true)
    }).toPass({timeout: 20000})
  })
})
