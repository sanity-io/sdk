import {createDocumentHandle, type DocumentHistoryEvent} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {useDocumentHistory, type UseDocumentHistoryResult} from './useDocumentHistory'

const articleHandle = createDocumentHandle({
  projectId: 'histProj1',
  dataset: 'production',
  documentId: 'article-1',
  documentType: 'article',
})

const otherHandle = createDocumentHandle({
  projectId: 'histProj2',
  dataset: 'staging',
  documentId: 'article-2',
  documentType: 'article',
})

test('useDocumentHistory returns typed timeline state and actions', () => {
  const result = useDocumentHistory({
    ...articleHandle,
    resourceName: 'main',
    limit: 50,
    includeEditEvents: true,
  })

  expectTypeOf(result).toEqualTypeOf<UseDocumentHistoryResult>()
  expectTypeOf(result.events).toEqualTypeOf<DocumentHistoryEvent[]>()
  expectTypeOf(result.hasMore).toEqualTypeOf<boolean>()
  expectTypeOf(result.isPending).toEqualTypeOf<boolean>()
  expectTypeOf(result.error).toEqualTypeOf<unknown>()
  expectTypeOf(result.loadMore).toEqualTypeOf<() => void>()
  expectTypeOf(result.expandEvent).toEqualTypeOf<(eventId: string) => Promise<void>>()
  expectTypeOf(result.refetch).toEqualTypeOf<() => Promise<void>>()
})

test('explicit resource generics require a matching document handle', () => {
  useDocumentHistory<'article', 'production', 'histProj1'>(articleHandle)
  // @ts-expect-error Handle belongs to a different project and dataset
  useDocumentHistory<'article', 'production', 'histProj1'>(otherHandle)
})
