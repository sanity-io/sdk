import {type SanityClient} from '@sanity/client'
import {firstValueFrom, of} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {fetchDocumentsHistoryEvents, type RawDocumentHistoryEvent} from './historyClient'

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
