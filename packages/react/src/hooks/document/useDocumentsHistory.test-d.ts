import {createDocumentHandle, type DocumentHistoryEvent} from '@sanity/sdk'
import {describe, expectTypeOf, it} from 'vitest'

import {
  useDocumentsHistory,
  type UseDocumentsHistoryOptions,
  type UseDocumentsHistoryResult,
} from './useDocumentsHistory'

describe('useDocumentsHistory types', () => {
  it('accepts DocumentHandle arrays with per-handle perspectives and returns typed history data', () => {
    const doc = createDocumentHandle({
      documentId: 'doc-1',
      documentType: 'article',
      projectId: 'proj-1',
      dataset: 'production',
    })

    const options: UseDocumentsHistoryOptions<'production', 'proj-1'> = {
      documents: [
        doc,
        {...doc, perspective: 'published'},
        {...doc, perspective: {releaseName: 'rSummer'}},
      ],
      limit: 50,
    }

    expectTypeOf(useDocumentsHistory).toBeFunction()
    expectTypeOf(options).toExtend<UseDocumentsHistoryOptions<'production', 'proj-1'>>()

    type Result = ReturnType<typeof useDocumentsHistory<'production', 'proj-1'>>
    expectTypeOf<Result>().toEqualTypeOf<UseDocumentsHistoryResult>()
    expectTypeOf<Result['data']>().toEqualTypeOf<DocumentHistoryEvent[]>()
    expectTypeOf<Result['loadMore']>().toEqualTypeOf<() => void>()
    expectTypeOf<Result['refetch']>().toEqualTypeOf<() => Promise<void>>()
  })
})
