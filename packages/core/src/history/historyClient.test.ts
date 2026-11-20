import {type SanityClient} from '@sanity/client'
import {firstValueFrom, of} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {
  fetchDocumentHistoryEvents,
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

describe('fetchDocumentHistoryEvents', () => {
  it('requests events using client.getDataUrl and history.events tag', async () => {
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
      fetchDocumentHistoryEvents(client, {
        variantId: 'drafts.doc-1',
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
      events: [rawEvent],
      nextCursor: 'cursor-2',
    })
  })

  it('supports non-dataset resource URLs and defaults missing variant events to empty array', async () => {
    const {client, request} = createMockClient(
      () => ({events: {}}),
      '/media-libraries/ml-123/history',
    )

    const result = await firstValueFrom(fetchDocumentHistoryEvents(client, {variantId: 'asset-1'}))

    expect(request).toHaveBeenCalledWith({
      url: '/media-libraries/ml-123/history/events/documents/asset-1',
      query: {},
      tag: 'history.events',
    })
    expect(result).toEqual({events: [], nextCursor: ''})
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

  it('parses NDJSON lines and filters out fromTransaction when range is open or distinct', async () => {
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

  it('keeps fromTransaction when fromTransaction equals toTransaction', async () => {
    const {client} = createMockClient(() => makeTx('rev-1'))

    const result = await firstValueFrom(
      fetchDocumentTransactions(client, {
        variantId: 'drafts.doc-1',
        fromTransaction: 'rev-1',
        toTransaction: 'rev-1',
      }),
    )

    expect(result.map((tx) => tx.id)).toEqual(['rev-1'])
  })

  it('returns empty array on empty NDJSON body', async () => {
    const {client} = createMockClient(() => '')
    const result = await firstValueFrom(
      fetchDocumentTransactions(client, {variantId: 'drafts.doc-1'}),
    )
    expect(result).toEqual([])
  })

  it('paginates 50-item chunks until fewer than 50 entries or toTransaction is reached', async () => {
    const page1 = Array.from({length: 50}, (_, idx) => makeTx(`rev-${idx}`))
    const page2 = Array.from({length: 50}, (_, idx) => makeTx(`rev-${49 + idx}`))

    let callCount = 0
    const {client, request} = createMockClient(() => {
      callCount += 1
      const items = callCount === 1 ? page1 : page2
      return items.map((tx) => JSON.stringify(tx)).join('\n')
    })

    // Stop when lastRawId === toTransaction ('rev-98') even though page2 has 50 items
    const result = await firstValueFrom(
      fetchDocumentTransactions(client, {
        variantId: 'drafts.doc-1',
        fromTransaction: 'rev-0',
        toTransaction: 'rev-98',
      }),
    )

    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: expect.objectContaining({
          fromTransaction: 'rev-49',
          toTransaction: 'rev-98',
        }),
      }),
    )
    expect(result).toHaveLength(98)
    expect(result[0]?.id).toBe('rev-1')
    expect(result.at(-1)?.id).toBe('rev-98')
  })

  it('throws an Error when a stream line contains an error object', async () => {
    const ndjson = `${JSON.stringify(makeTx('rev-1'))}\n${JSON.stringify({error: {description: 'Translog cursor expired'}})}`
    const {client} = createMockClient(() => ndjson)

    await expect(
      firstValueFrom(fetchDocumentTransactions(client, {variantId: 'drafts.doc-1'})),
    ).rejects.toThrow('Translog cursor expired')
  })
})
