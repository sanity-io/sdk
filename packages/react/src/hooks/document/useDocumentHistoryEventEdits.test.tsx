import {
  type DocumentHistoryCreatedEvent,
  type DocumentHistoryEditedEvent,
  documentHistoryEventEdits,
  type DocumentHistoryEventEditsOptions,
  type ExpandableDocumentHistoryEvent,
  type StateSource,
} from '@sanity/sdk'
import {type FetcherSnapshot} from '@sanity/sdk/_internal'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useDocumentHistoryEventEdits} from './useDocumentHistoryEventEdits'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    documentHistoryEventEdits: {
      getState: vi.fn(),
      resolveState: vi.fn(),
      refetch: vi.fn(),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
    },
  }
})

type LifecycleItem = DocumentHistoryEditedEvent | DocumentHistoryCreatedEvent

const CREATE_EVENT: DocumentHistoryCreatedEvent = {
  id: 'drafts.doc-1:draft-rev-create',
  type: 'created',
  author: 'u1',
  timestamp: '2025-05-06T12:00:00Z',
  documentId: 'doc-1',
  variantId: 'drafts.doc-1',
  documentVariantType: 'draft',
  versionId: 'drafts.doc-1',
  versionRevisionId: 'draft-rev-create',
}

const PUBLISH_EVENT: ExpandableDocumentHistoryEvent = {
  id: 'drafts.doc-1:draft-rev-final',
  type: 'published',
  author: 'u1',
  timestamp: '2025-05-06T12:10:00Z',
  documentId: 'doc-1',
  variantId: 'drafts.doc-1',
  documentVariantType: 'draft',
  revisionId: 'pub-1',
  versionId: 'drafts.doc-1',
  versionRevisionId: 'draft-rev-final',
  publishCause: 'document.publish',
  creationEvent: CREATE_EVENT,
}

const EDIT_EVENT: DocumentHistoryEditedEvent = {
  id: 'drafts.doc-1:draft-rev-mid',
  type: 'edited',
  author: 'u2',
  timestamp: '2025-05-06T12:05:00Z',
  documentId: 'doc-1',
  variantId: 'drafts.doc-1',
  documentVariantType: 'draft',
  revisionId: 'draft-rev-mid',
  previousRevisionId: 'draft-rev-create',
  contributors: ['u2'],
  transactions: [
    {
      type: 'editTransaction',
      author: 'u2',
      timestamp: '2025-05-06T12:05:00Z',
      revisionId: 'draft-rev-mid',
    },
  ],
}

function setupMockSnapshot(
  getSnapshot: (options: DocumentHistoryEventEditsOptions) => FetcherSnapshot<LifecycleItem[]>,
  changed$?: Subject<void>,
) {
  const subscribe = vi.fn((cb?: () => void) => {
    const sub = changed$?.subscribe(() => cb?.())
    return () => sub?.unsubscribe()
  })

  vi.mocked(documentHistoryEventEdits.getState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => getSnapshot(options),
        subscribe,
        get observable(): Observable<FetcherSnapshot<LifecycleItem[]>> {
          throw new Error('Not implemented')
        },
      }) as StateSource<FetcherSnapshot<LifecycleItem[]>>,
  )
}

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="proj-1" dataset="production" fallback={<p>Auth…</p>}>
      <Suspense fallback={<p data-testid="suspended">Suspended</p>}>{children}</Suspense>
    </ResourceProvider>
  )
}

describe('useDocumentHistoryEventEdits', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('suspends until lifecycle edits resolve, normalizes resource context, and supports refetch', async () => {
    const loaded: LifecycleItem[] = [EDIT_EVENT, CREATE_EVENT]
    let snapshot: FetcherSnapshot<LifecycleItem[]> = {
      status: 'pending',
      data: undefined,
      error: undefined,
      isFetching: true,
      dataUpdatedAt: undefined,
    }
    const changed$ = new Subject<void>()
    setupMockSnapshot(() => snapshot, changed$)

    let settle!: () => void
    vi.mocked(documentHistoryEventEdits.resolveState).mockReturnValue(
      new Promise<LifecycleItem[]>((resolve) => {
        settle = () => resolve(loaded)
      }),
    )
    vi.mocked(documentHistoryEventEdits.refetch).mockResolvedValue(loaded)

    function View() {
      const {data, isFetching, refetch} = useDocumentHistoryEventEdits({event: PUBLISH_EVENT})
      return (
        <div>
          <div data-testid="out">{`${data.map((e) => e.id).join(',')}:${isFetching}`}</div>
          <button onClick={() => void refetch()} type="button">
            refetch
          </button>
        </div>
      )
    }

    render(<View />, {wrapper: Wrapper})
    expect(screen.getByTestId('suspended')).toBeInTheDocument()
    expect(documentHistoryEventEdits.resolveState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: PUBLISH_EVENT,
        resource: {projectId: 'proj-1', dataset: 'production'},
      }),
    )

    await act(async () => {
      snapshot = {
        status: 'success',
        data: loaded,
        error: undefined,
        isFetching: false,
        dataUpdatedAt: 1,
      }
      settle()
    })

    expect(screen.getByTestId('out')).toHaveTextContent(
      'drafts.doc-1:draft-rev-mid,drafts.doc-1:draft-rev-create:false',
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'refetch'}))
    })

    expect(documentHistoryEventEdits.refetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        event: PUBLISH_EVENT,
        resource: {projectId: 'proj-1', dataset: 'production'},
      }),
    )
  })

  it('surfaces errors to the nearest error boundary and marks them with SDK origin', () => {
    const failure = new Error('Fetch edits failed')
    setupMockSnapshot(() => ({
      status: 'error',
      data: undefined,
      error: failure,
      isFetching: false,
      dataUpdatedAt: undefined,
    }))

    let caughtError: unknown
    function View() {
      useDocumentHistoryEventEdits({event: PUBLISH_EVENT})
      return null
    }

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary
        fallbackRender={({error}) => {
          caughtError = error
          return <p>Failed</p>
        }}
      >
        <View />
      </ErrorBoundary>,
      {wrapper: Wrapper},
    )
    consoleSpy.mockRestore()

    expect(caughtError).toBe(failure)
    expect(Object.hasOwn(failure, Symbol.for('@sanity/sdk/errorOrigin'))).toBe(true)
  })
})
