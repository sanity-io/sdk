import {
  type DocumentHistoryEvent,
  type DocumentsHistoryOptions,
  getDocumentsHistoryErrorState,
  getDocumentsHistoryHasMoreState,
  getDocumentsHistoryState,
  loadMoreDocumentsHistory,
  refetchDocumentsHistory,
  resolveDocumentsHistory,
  type StateSource,
} from '@sanity/sdk'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useDocumentsHistory} from './useDocumentsHistory'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getDocumentsHistoryState: vi.fn(),
    getDocumentsHistoryHasMoreState: vi.fn(),
    getDocumentsHistoryErrorState: vi.fn(),
    resolveDocumentsHistory: vi.fn(),
    loadMoreDocumentsHistory: vi.fn(),
    refetchDocumentsHistory: vi.fn(),
  }
})

const DOC_A = {documentId: 'doc-a', documentType: 'article'}
const DOC_B = {documentId: 'doc-b', documentType: 'article'}
const EMPTY: DocumentHistoryEvent[] = []

function makeEvent(id: string, documentId = 'doc-a'): DocumentHistoryEvent {
  return {
    id: `${documentId}:${id}`,
    type: 'created',
    revisionId: id,
    documentId,
    variantId: documentId,
    documentVariantType: 'published',
    author: 'user-1',
    timestamp: '2025-05-06T12:00:00Z',
  }
}

function setupMockSources({
  getEvents,
  getHasMore = () => false,
  getError = () => undefined,
  changed$,
}: {
  getEvents: (options: DocumentsHistoryOptions) => DocumentHistoryEvent[] | undefined
  getHasMore?: (options: DocumentsHistoryOptions) => boolean
  getError?: (options: DocumentsHistoryOptions) => unknown
  changed$?: Subject<void>
}) {
  const subscribe = vi.fn((cb?: () => void) => {
    const sub = changed$?.subscribe(() => cb?.())
    return () => sub?.unsubscribe()
  })

  vi.mocked(getDocumentsHistoryState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => (options.documents.length === 0 ? EMPTY : getEvents(options)),
        subscribe,
        get observable(): Observable<DocumentHistoryEvent[] | undefined> {
          throw new Error('Not implemented')
        },
      }) as StateSource<DocumentHistoryEvent[] | undefined>,
  )
  vi.mocked(getDocumentsHistoryHasMoreState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => (options.documents.length === 0 ? false : getHasMore(options)),
        subscribe,
        get observable(): Observable<boolean> {
          throw new Error('Not implemented')
        },
      }) as StateSource<boolean>,
  )
  vi.mocked(getDocumentsHistoryErrorState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => (options.documents.length === 0 ? undefined : getError(options)),
        subscribe,
        get observable(): Observable<unknown> {
          throw new Error('Not implemented')
        },
      }) as StateSource<unknown>,
  )
}

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="proj-1" dataset="production" fallback={<p>Auth…</p>}>
      <Suspense fallback={<p data-testid="suspended">Suspended</p>}>{children}</Suspense>
    </ResourceProvider>
  )
}

describe('useDocumentsHistory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns an empty result synchronously without suspending when documents is empty', () => {
    setupMockSources({getEvents: () => undefined})

    function EmptyHistory() {
      const {data, hasMore, isPending, error} = useDocumentsHistory({documents: []})
      return (
        <div data-testid="empty">
          {data.length}:{String(hasMore)}:{String(isPending)}:{String(error)}
        </div>
      )
    }

    render(<EmptyHistory />, {wrapper: Wrapper})
    expect(screen.queryByTestId('suspended')).not.toBeInTheDocument()
    expect(screen.getByTestId('empty')).toHaveTextContent('0:false:false:undefined')
    expect(resolveDocumentsHistory).not.toHaveBeenCalled()
  })

  it('suspends until initial load resolves and renders events for one or many handles', async () => {
    const loaded = [makeEvent('rev-2', 'doc-a'), makeEvent('rev-1', 'doc-b')]
    const state: {events: DocumentHistoryEvent[] | undefined} = {events: undefined}
    const changed$ = new Subject<void>()
    setupMockSources({getEvents: () => state.events, changed$})

    let settle!: () => void
    vi.mocked(resolveDocumentsHistory).mockReturnValue(
      new Promise<DocumentHistoryEvent[]>((resolve) => {
        settle = () => resolve(loaded)
      }),
    )

    function Timeline() {
      const {data, hasMore, isPending} = useDocumentsHistory({
        documents: [{...DOC_A, perspective: 'published'}, DOC_B],
      })
      return (
        <div>
          <span data-testid="meta">
            {String(hasMore)}:{String(isPending)}
          </span>
          <ul>
            {data.map((ev) => (
              <li key={ev.id}>{ev.id}</li>
            ))}
          </ul>
        </div>
      )
    }

    render(<Timeline />, {wrapper: Wrapper})
    expect(screen.getByTestId('suspended')).toBeInTheDocument()
    expect(resolveDocumentsHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documents: [
          expect.objectContaining({
            documentId: 'doc-a',
            documentType: 'article',
            perspective: 'published',
            resource: {projectId: 'proj-1', dataset: 'production'},
          }),
          expect.objectContaining({
            documentId: 'doc-b',
            documentType: 'article',
            resource: {projectId: 'proj-1', dataset: 'production'},
          }),
        ],
        signal: expect.any(AbortSignal),
      }),
    )

    await act(async () => {
      state.events = loaded
      settle()
    })

    expect(screen.queryByTestId('suspended')).not.toBeInTheDocument()
    expect(screen.getByText('doc-a:rev-2')).toBeInTheDocument()
    expect(screen.getByText('doc-b:rev-1')).toBeInTheDocument()
    expect(screen.getByTestId('meta')).toHaveTextContent('false:false')
  })

  it('keeps previous events visible with isPending=true while transitioning between document sets and aborts superseded transitions', async () => {
    const eventsA = [makeEvent('a-1', 'doc-a')]
    const eventsB = [makeEvent('b-1', 'doc-b')]
    const loadedByFirstDoc = new Map<string, DocumentHistoryEvent[] | undefined>([
      ['doc-a', eventsA],
      ['doc-b', undefined],
    ])
    setupMockSources({
      getEvents: (opts) => loadedByFirstDoc.get(opts.documents[0]?.documentId ?? ''),
    })

    const signals: AbortSignal[] = []
    let settleB!: () => void
    vi.mocked(resolveDocumentsHistory).mockImplementation((_instance, opts) => {
      if (opts.signal) signals.push(opts.signal)
      return new Promise<DocumentHistoryEvent[]>((resolve) => {
        settleB = () => resolve(eventsB)
      })
    })

    function Timeline({docId}: {docId: string}) {
      const {data, isPending} = useDocumentsHistory({
        documents: [{documentId: docId, documentType: 'article', perspective: 'published'}],
      })
      return (
        <div data-testid="view">
          {data.map((e) => e.id).join(',')}|pending={String(isPending)}
        </div>
      )
    }

    const {rerender} = render(<Timeline docId="doc-a" />, {wrapper: Wrapper})
    expect(screen.getByTestId('view')).toHaveTextContent('doc-a:a-1|pending=false')

    rerender(<Timeline docId="doc-b" />)
    expect(screen.queryByTestId('suspended')).not.toBeInTheDocument()
    expect(screen.getByTestId('view')).toHaveTextContent('doc-a:a-1|pending=true')
    expect(signals).toHaveLength(1)
    expect(signals[0]?.aborted).toBe(false)

    await act(async () => {
      loadedByFirstDoc.set('doc-b', eventsB)
      settleB()
    })

    expect(screen.getByTestId('view')).toHaveTextContent('doc-b:b-1|pending=false')
  })

  it('calls loadMoreDocumentsHistory and refetchDocumentsHistory with normalized options', async () => {
    const events = [makeEvent('rev-1')]
    setupMockSources({
      getEvents: () => events,
      getHasMore: () => true,
    })

    let settleLoadMore!: () => void
    vi.mocked(loadMoreDocumentsHistory).mockReturnValue(
      new Promise<void>((resolve) => {
        settleLoadMore = resolve
      }),
    )
    vi.mocked(refetchDocumentsHistory).mockResolvedValue(undefined)

    function Controls() {
      const {hasMore, isPending, loadMore, refetch} = useDocumentsHistory({
        documents: [{...DOC_A, perspective: 'published'}],
        limit: 25,
      })
      return (
        <div>
          <span data-testid="state">
            {String(hasMore)}:{String(isPending)}
          </span>
          <button onClick={loadMore}>Load more</button>
          <button onClick={() => void refetch()}>Refetch</button>
        </div>
      )
    }

    render(<Controls />, {wrapper: Wrapper})
    expect(screen.getByTestId('state')).toHaveTextContent('true:false')

    fireEvent.click(screen.getByText('Load more'))
    expect(loadMoreDocumentsHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 25,
        documents: [
          expect.objectContaining({
            documentId: 'doc-a',
            documentType: 'article',
            perspective: 'published',
            resource: {projectId: 'proj-1', dataset: 'production'},
          }),
        ],
      }),
    )
    expect(screen.getByTestId('state')).toHaveTextContent('true:true')

    await act(async () => {
      settleLoadMore()
    })
    expect(screen.getByTestId('state')).toHaveTextContent('true:false')

    fireEvent.click(screen.getByText('Refetch'))
    expect(refetchDocumentsHistory).toHaveBeenCalledTimes(1)
  })

  it('throws on mismatched resources across handles', () => {
    setupMockSources({getEvents: () => []})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    function Mismatched() {
      useDocumentsHistory({
        documents: [
          {...DOC_A, projectId: 'proj-1', dataset: 'production'},
          {...DOC_B, projectId: 'proj-1', dataset: 'staging'},
        ],
      })
      return null
    }

    render(
      <ErrorBoundary fallbackRender={({error}) => <p data-testid="err">{String(error)}</p>}>
        <Wrapper>
          <Mismatched />
        </Wrapper>
      </ErrorBoundary>,
    )

    expect(screen.getByTestId('err')).toHaveTextContent(/Mismatched resources found in documents/)
    consoleError.mockRestore()
  })
})
