import {
  createDocumentHandle,
  type DocumentHistoryCreatedEvent,
  type DocumentHistoryEditedEvent,
  type ExpandableDocumentHistoryEvent,
} from '@sanity/sdk'
import {expectTypeOf, test} from 'vitest'

import {type FetcherHookResult} from '../helpers/createFetcherHook'
import {useDocumentHistoryEventEdits} from './useDocumentHistoryEventEdits'

declare const publishEvent: ExpandableDocumentHistoryEvent

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

test('useDocumentHistoryEventEdits returns a typed FetcherHookResult and accepts handles or bare event', () => {
  const fromContext = useDocumentHistoryEventEdits({event: publishEvent})
  const fromHandle = useDocumentHistoryEventEdits({
    ...articleHandle,
    resourceName: 'main',
    event: publishEvent,
  })

  type Expected = FetcherHookResult<Array<DocumentHistoryEditedEvent | DocumentHistoryCreatedEvent>>
  expectTypeOf(fromContext).toEqualTypeOf<Expected>()
  expectTypeOf(fromHandle).toEqualTypeOf<Expected>()
})

test('explicit dataset/project generics require a matching handle', () => {
  useDocumentHistoryEventEdits<'production', 'histProj1'>({...articleHandle, event: publishEvent})
  // @ts-expect-error Handle belongs to a different project and dataset
  useDocumentHistoryEventEdits<'production', 'histProj1'>({...otherHandle, event: publishEvent})
})
