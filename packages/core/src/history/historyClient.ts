import {type SanityClient} from '@sanity/client'
import {map, type Observable} from 'rxjs'

import {type DocumentHistoryPublishCause} from './types'

/**
 * API version used for Content Lake History API requests.
 *
 * @internal
 */
export const HISTORY_API_VERSION = 'v2025-05-06'

interface RawDocumentHistoryBaseEvent {
  author: string
  timestamp: string
  documentId: string
}

/**
 * Raw semantic event returned by `/events/documents/<ids>` before normalization to
 * {@link DocumentHistoryEvent}.
 *
 * @internal
 */
export type RawDocumentHistoryEvent =
  | (RawDocumentHistoryBaseEvent & {
      type: 'createLiveDocument'
      revisionId: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'updateLiveDocument'
      revisionId: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'deleteDocumentGroup'
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'createDocumentVersion'
      releaseId?: string
      versionId: string
      versionRevisionId: string
      revisionId?: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'deleteDocumentVersion'
      releaseId?: string
      versionId: string
      versionRevisionId: string
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'publishDocumentVersion'
      revisionId: string
      releaseId?: string
      versionId: string
      versionRevisionId?: string
      publishCause: DocumentHistoryPublishCause
      contributors?: string[]
    })
  | (RawDocumentHistoryBaseEvent & {
      type: 'unpublishDocument'
      releaseId?: string
      versionId: string
      versionRevisionId: string
    })

interface HistoryEventsApiResponse {
  events?: Record<string, RawDocumentHistoryEvent[] | undefined>
  nextCursor?: string
}

/**
 * Fetches one page of semantic lifecycle events for one or more `variantIds` from Content Lake.
 *
 * @internal
 */
export function fetchDocumentsHistoryEvents(
  client: SanityClient,
  {
    variantIds,
    limit,
    nextCursor,
  }: {
    variantIds: readonly string[]
    limit?: number
    nextCursor?: string
  },
): Observable<{eventsByVariant: Record<string, RawDocumentHistoryEvent[]>; nextCursor: string}> {
  const query: Record<string, string> = {
    ...(limit !== undefined ? {limit: String(limit)} : {}),
    ...(nextCursor ? {nextCursor} : {}),
  }
  const encodedIds = variantIds.map((id) => encodeURIComponent(id)).join(',')

  return client.observable
    .request<HistoryEventsApiResponse>({
      url: client.getDataUrl('history', `events/documents/${encodedIds}`),
      query,
      tag: 'history.events',
    })
    .pipe(
      map((response) => {
        const eventsByVariant: Record<string, RawDocumentHistoryEvent[]> = {}
        for (const [variantId, events] of Object.entries(response.events ?? {})) {
          if (events) {
            eventsByVariant[variantId] = events
          }
        }
        return {
          eventsByVariant,
          nextCursor: response.nextCursor ?? '',
        }
      }),
    )
}
