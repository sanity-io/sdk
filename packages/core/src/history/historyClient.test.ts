import {type SanityClient} from '@sanity/client'
import {firstValueFrom, of} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {
  fetchActiveVariantTransactions,
  fetchDocumentsHistoryEvents,
  fetchDocumentTransactions,
  type RawDocumentHistoryEvent,
} from './historyClient'

function createMockClient(
  requestImpl: (options: {url: string; query?: Record<string, string>; tag?: string}) => unknown,
  basePath = '/data/history/production',
) {
  const request = vi.fn((options: {url: string; query?: Record<string, string>; tag?: string}) =>
    of(requestImpl(options)),
  )
  const getDataUrl = vi.fn((operation: string, path?: string) =>
    path ? `${basePath.replace('/history/', `/${operation}/`)}/${path}` : basePath,
  )

  return {
    client: {
      getDataUrl,
      observable: {request},
    } as unknown as SanityClient,
    request,
    getDataUrl,
  }
}

describe('fetchDocumentsHistoryEvents', () => {
  it('requests events for a single variant using client.getDataUrl and history.events tag', async () => {
    const rawEvent: RawDocumentHistoryEvent = {
      type: 'publishDocumentVersion',
      documentId: 'doc-1',
      revisionId: 'rev-1',
      versionId: 'drafts.doc-1',
      versionRevisionId: 'vrev-1',
      publishCause: 'document.publish',
      author: 'user-1',
      timestamp: '2025-05-06T10:00:00Z',
    }
    const {client, request, getDataUrl} = createMockClient(() => ({
      events: {'drafts.doc-1': [rawEvent]},
      nextCursor: 'cursor-2',
    }))

    const result = await firstValueFrom(
      fetchDocumentsHistoryEvents(client, {
        variantIds: ['drafts.doc-1'],
        limit: 25,
        nextCursor: 'cursor-1',
      }),
    )

    expect(getDataUrl).toHaveBeenCalledWith('history', 'events/documents/drafts.doc-1')
    expect(request).toHaveBeenCalledWith({
      url: '/data/history/production/events/documents/drafts.doc-1',
      query: {limit: '25', nextCursor: 'cursor-1'},
      tag: 'history.events',
    })
    expect(result).toEqual({
      eventsByVariant: {'drafts.doc-1': [rawEvent]},
      nextCursor: 'cursor-2',
    })
  })

  it('URL-encodes each ID individually and joins with literal commas', async () => {
    const {client, request, getDataUrl} = createMockClient(() => ({
      events: {
        'article-1': [],
        'drafts.article/2': [],
        'versions.summer.article-1': [],
      },
      nextCursor: '',
    }))

    const result = await firstValueFrom(
      fetchDocumentsHistoryEvents(client, {
        variantIds: ['article-1', 'drafts.article/2', 'versions.summer.article-1'],
      }),
    )

    expect(getDataUrl).toHaveBeenCalledWith(
      'history',
      'events/documents/article-1,drafts.article%2F2,versions.summer.article-1',
    )
    expect(request).toHaveBeenCalledWith({
      url: '/data/history/production/events/documents/article-1,drafts.article%2F2,versions.summer.article-1',
      query: {},
      tag: 'history.events',
    })
    expect(result).toEqual({
      eventsByVariant: {
        'article-1': [],
        'drafts.article/2': [],
        'versions.summer.article-1': [],
      },
      nextCursor: '',
    })
  })

  it('supports non-dataset resource URLs and handles missing events payload', async () => {
    const {client, request} = createMockClient(() => ({}), '/media-libraries/ml-123/history')

    const result = await firstValueFrom(
      fetchDocumentsHistoryEvents(client, {variantIds: ['asset-1']}),
    )

    expect(request).toHaveBeenCalledWith({
      url: '/media-libraries/ml-123/history/events/documents/asset-1',
      query: {},
      tag: 'history.events',
    })
    expect(result).toEqual({eventsByVariant: {}, nextCursor: ''})
  })
})

describe('fetchDocumentTransactions', () => {
  const makeTx = (id: string) => ({
    id,
    author: 'user-1',
    timestamp: '2025-05-06T10:00:00Z',
    documentIDs: ['drafts.doc-1'],
    effects: {
      'drafts.doc-1': {apply: [1, 'a'], revert: [1, 'b']},
    },
  })

  it('parses NDJSON lines and filters out fromTransaction when range is distinct', async () => {
    const ndjson = [makeTx('rev-0'), makeTx('rev-1'), makeTx('rev-2')]
      .map((item) => JSON.stringify(item))
      .join('\n')

    const {client, request} = createMockClient(() => `${ndjson}\n`)

    const result = await firstValueFrom(
      fetchDocumentTransactions(client, {
        variantId: 'drafts.doc-1',
        fromTransaction: 'rev-0',
      }),
    )

    expect(request).toHaveBeenCalledWith({
      url: '/data/history/production/transactions/drafts.doc-1',
      query: {
        excludeContent: 'true',
        includeIdentifiedDocumentsOnly: 'true',
        effectFormat: 'mendoza',
        limit: '50',
        fromTransaction: 'rev-0',
      },
      tag: 'history.transactions',
    })
    expect(result.map((tx) => tx.id)).toEqual(['rev-1', 'rev-2'])
  })

  it('paginates 50-item chunks until a partial page or toTransaction is reached', async () => {
    const page1 = Array.from({length: 50}, (_, i) => makeTx(`rev-${i}`))
    const page2 = [makeTx('rev-49'), makeTx('rev-50')]

    let call = 0
    const {client, request} = createMockClient(() => {
      call += 1
      const items = call === 1 ? page1 : page2
      return items.map((item) => JSON.stringify(item)).join('\n')
    })

    const result = await firstValueFrom(
      fetchDocumentTransactions(client, {
        variantId: 'drafts.doc-1',
        toTransaction: 'rev-50',
      }),
    )

    expect(request).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(51)
    expect(result[0]?.id).toBe('rev-0')
    expect(result[50]?.id).toBe('rev-50')
  })

  it('throws when an NDJSON record contains an error payload', async () => {
    const {client} = createMockClient(() =>
      JSON.stringify({error: {description: 'Retention expired'}}),
    )

    await expect(
      firstValueFrom(fetchDocumentTransactions(client, {variantId: 'drafts.doc-1'})),
    ).rejects.toThrow('Retention expired')
  })
})

describe('fetchActiveVariantTransactions', () => {
  const makeTx = (
    id: string,
    effects: Record<string, {apply: [number, unknown]; revert: [number, unknown]}>,
    timestamp = '2025-05-06T10:00:00.000Z',
  ) => ({
    id,
    author: 'user-1',
    timestamp,
    documentIDs: Object.keys(effects),
    effects,
  })

  it('short-circuits with empty object and zero requests when targets is empty', async () => {
    const {client, request} = createMockClient(() => '')
    const result = await firstValueFrom(fetchActiveVariantTransactions(client, []))
    expect(result).toEqual({})
    expect(request).not.toHaveBeenCalled()
  })

  it('batches open variants with reverse=true, stops at baseline/created/deleted, and returns ascending order', async () => {
    const ndjson = [
      makeTx('tx-3', {'drafts.doc-a': {apply: [1, 'a2'], revert: [1, 'a1']}}),
      makeTx('tx-del-c', {'drafts.doc-c': {apply: [0, null], revert: [1, 'c1']}}),
      makeTx('tx-2', {
        'drafts.doc-a': {apply: [1, 'a1'], revert: [1, 'a0']},
        'versions.r1.doc-b': {apply: [1, 'b1'], revert: [1, 'b0']},
      }),
      makeTx('tx-1', {'drafts.doc-a': {apply: [1, 'a0'], revert: [0, null]}}),
      makeTx('tx-0', {'versions.r1.doc-b': {apply: [1, 'b0'], revert: [0, null]}}),
    ]
      .map((item) => JSON.stringify(item))
      .join('\n')

    const {client, request} = createMockClient(() => `${ndjson}\n`)

    const result = await firstValueFrom(
      fetchActiveVariantTransactions(client, [
        {variantId: 'drafts.doc-a', baselineRevisionId: 'tx-1'},
        {variantId: 'versions.r1.doc-b'},
        {variantId: 'drafts.doc-c'},
      ]),
    )

    expect(request).toHaveBeenCalledWith({
      url: '/data/history/production/transactions/drafts.doc-a,versions.r1.doc-b,drafts.doc-c',
      query: {
        excludeContent: 'true',
        excludeMutations: 'true',
        includeIdentifiedDocumentsOnly: 'true',
        effectFormat: 'mendoza',
        reverse: 'true',
        limit: '100',
      },
      tag: 'history.transactions',
    })

    expect(result['drafts.doc-a']?.transactions.map((tx) => tx.id)).toEqual(['tx-2', 'tx-3'])
    expect(result['drafts.doc-a']?.boundaryRevisionId).toBe('tx-1')
    expect(result['drafts.doc-a']?.truncated).toBe(false)

    expect(result['versions.r1.doc-b']?.transactions.map((tx) => tx.id)).toEqual(['tx-2'])
    expect(result['versions.r1.doc-b']?.boundaryRevisionId).toBe('tx-0')
    expect(result['versions.r1.doc-b']?.truncated).toBe(false)

    expect(result['drafts.doc-c']?.transactions).toEqual([])
    expect(result['drafts.doc-c']?.truncated).toBe(false)
  })

  it('paginates backwards with toTransaction + toInclusive=false and marks truncated at the page cap', async () => {
    let call = 0
    const {client, request} = createMockClient(() => {
      call += 1
      const pageItems = Array.from({length: 100}, (_, i) => {
        const index = (call - 1) * 100 + i
        return makeTx(`tx-${400 - index}`, {
          'drafts.doc-a': {apply: [1, `v${index}`], revert: [1, `v${index + 1}`]},
        })
      })
      return pageItems.map((item) => JSON.stringify(item)).join('\n')
    })

    const result = await firstValueFrom(
      fetchActiveVariantTransactions(client, [{variantId: 'drafts.doc-a'}]),
    )

    expect(request).toHaveBeenCalledTimes(4)
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: expect.objectContaining({
          reverse: 'true',
          toTransaction: 'tx-301',
          toInclusive: 'false',
        }),
      }),
    )
    expect(result['drafts.doc-a']?.transactions).toHaveLength(400)
    expect(result['drafts.doc-a']?.transactions[0]?.id).toBe('tx-1')
    expect(result['drafts.doc-a']?.transactions[399]?.id).toBe('tx-400')
    expect(result['drafts.doc-a']?.truncated).toBe(true)
  })
})
