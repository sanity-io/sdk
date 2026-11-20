import {
  type DocumentHistoryEvent,
  type DocumentHistoryOptions,
  expandDocumentHistoryEvent,
  getDocumentHistoryErrorState,
  getDocumentHistoryHasMoreState,
  getDocumentHistoryState,
  loadMoreDocumentHistory,
  refetchDocumentHistory,
  resolveDocumentHistory,
  type StateSource,
} from '@sanity/sdk'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {ErrorBoundary} from 'react-error-boundary'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useDocumentHistory} from './useDocumentHistory'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getDocumentHistoryState: vi.fn(),
    getDocumentHistoryHasMoreState: vi.fn(),
    getDocumentHistoryErrorState: vi.fn(),
    resolveDocumentHistory: vi.fn(),
    loadMoreDocumentHistory: vi.fn(),
    expandDocumentHistoryEvent: vi.fn(),
    refetchDocumentHistory: vi.fn(),
  }
})

const HANDLE = {documentId: 'doc-1', documentType: 'article'}

function makeEvent(id: string): DocumentHistoryEvent {
  return {
    id,
    type: 'createLiveDocument',
    revisionId: id,
    documentId: 'doc-1',
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
  getEvents: (options: DocumentHistoryOptions) => DocumentHistoryEvent[] | undefined
  getHasMore?: (options: DocumentHistoryOptions) => boolean
  getError?: (options: DocumentHistoryOptions) => unknown
  changed$?: Subject<void>
}) {
  const subscribe = vi.fn((cb?: () => void) => {
    const sub = changed$?.subscribe(() => cb?.())
    return () => sub?.unsubscribe()
  })

  vi.mocked(getDocumentHistoryState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => getEvents(options),
        subscribe,
        get observable(): Observable<DocumentHistoryEvent[] | undefined> {
          throw new Error('Not implemented')
        },
      }) as StateSource<DocumentHistoryEvent[] | undefined>,
  )
  vi.mocked(getDocumentHistoryHasMoreState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => getHasMore(options),
        subscribe,
        get observable(): Observable<boolean> {
          throw new Error('Not implemented')
        },
      }) as StateSource<boolean>,
  )
  vi.mocked(getDocumentHistoryErrorState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => getError(options),
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

describe('useDocumentHistory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('suspends until initial load resolves and renders events', async () => {
    const loaded = [makeEvent('rev-2'), makeEvent('rev-1')]
    const state: {events: DocumentHistoryEvent[] | undefined} = {events: undefined}
    const changed$ = new Subject<void>()
    setupMockSources({getEvents: () => state.events, changed$})

    let settle!: () => void
    vi.mocked(resolveDocumentHistory).mockReturnValue(
      new Promise<DocumentHistoryEvent[]>((resolve) => {
        settle = () => resolve(loaded)
      }),
    )

    function View() {
      const {events, isPending} = useDocumentHistory({
        ...HANDLE,
        limit: 20,
        includeEditEvents: false,
      })
      return <div data-testid="out">{`${events.length}:${isPending ? 'pending' : 'idle'}`}</div>
    }

    render(<View />, {wrapper: Wrapper})
    expect(screen.getByTestId('suspended')).toBeInTheDocument()
    expect(resolveDocumentHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-1',
        documentType: 'article',
        limit: 20,
        includeEditEvents: false,
        resource: {projectId: 'proj-1', dataset: 'production'},
        signal: expect.any(AbortSignal),
      }),
    )

    await act(async () => {
      state.events = loaded
      settle()
    })

    expect(screen.getByTestId('out')).toHaveTextContent('2:idle')
  })

  it('transitions without re-suspending when switching document handles', async () => {
    const doc1Events = [makeEvent('doc1-ev')]
    const doc2Events = [makeEvent('doc2-ev-a'), makeEvent('doc2-ev-b')]
    const store = new Map<string, DocumentHistoryEvent[]>([['doc-1', doc1Events]])
    const changed$ = new Subject<void>()

    setupMockSources({
      getEvents: (opts) => store.get(opts.documentId),
      changed$,
    })

    const signals = new Map<string, AbortSignal | undefined>()
    let resolveDoc2!: () => void
    vi.mocked(resolveDocumentHistory).mockImplementation((_instance, opts) => {
      signals.set(opts.documentId, opts.signal)
      return new Promise<DocumentHistoryEvent[]>((resolve) => {
        resolveDoc2 = () => resolve(doc2Events)
      })
    })

    function View({documentId}: {documentId: string}) {
      const {events, isPending} = useDocumentHistory({documentId, documentType: 'article'})
      return <div data-testid="out">{`${events[0]?.id}:${isPending ? 'pending' : 'idle'}`}</div>
    }

    const {rerender} = render(<View documentId="doc-1" />, {wrapper: Wrapper})
    expect(screen.getByTestId('out')).toHaveTextContent('doc1-ev:idle')

    await act(async () => {
      rerender(<View documentId="doc-2" />)
    })

    // Keeps doc-1 events visible with isPending: true instead of showing Suspense fallback
    expect(screen.queryByTestId('suspended')).not.toBeInTheDocument()
    expect(screen.getByTestId('out')).toHaveTextContent('doc1-ev:pending')

    await act(async () => {
      store.set('doc-2', doc2Events)
      resolveDoc2()
    })

    await vi.waitFor(() => expect(screen.getByTestId('out')).toHaveTextContent('doc2-ev-a:idle'))
    expect(signals.get('doc-2')?.aborted).toBe(false)
  })

  it('handles loadMore, expandEvent, refetch, and non-fatal pagination errors', async () => {
    const loaded = [makeEvent('rev-1')]
    let currentError: unknown
    const changed$ = new Subject<void>()

    setupMockSources({
      getEvents: () => loaded,
      getHasMore: () => true,
      getError: () => currentError,
      changed$,
    })

    let rejectLoadMore!: (err: Error) => void
    vi.mocked(loadMoreDocumentHistory).mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectLoadMore = reject
        }),
    )
    vi.mocked(expandDocumentHistoryEvent).mockResolvedValue(undefined)
    vi.mocked(refetchDocumentHistory).mockResolvedValue(undefined)

    function View() {
      const result = useDocumentHistory(HANDLE)
      return (
        <div>
          <div data-testid="out">
            {`${result.events.length}:${result.hasMore}:${result.isPending}:${result.error instanceof Error ? result.error.message : 'none'}`}
          </div>
          <button onClick={result.loadMore} type="button">
            loadMore
          </button>
          <button onClick={() => void result.expandEvent('rev-1')} type="button">
            expand
          </button>
          <button onClick={() => void result.refetch()} type="button">
            refetch
          </button>
        </div>
      )
    }

    render(
      <ErrorBoundary fallback={<p data-testid="boundary">Boundary crashed</p>}>
        <View />
      </ErrorBoundary>,
      {wrapper: Wrapper},
    )

    expect(screen.getByTestId('out')).toHaveTextContent('1:true:false:none')

    fireEvent.click(screen.getByRole('button', {name: 'loadMore'}))
    expect(screen.getByTestId('out')).toHaveTextContent('1:true:true:none')

    await act(async () => {
      currentError = new Error('loadMore failed')
      rejectLoadMore(currentError as Error)
      changed$.next()
    })

    // Error boundary did not crash; error is surfaced on result.error
    expect(screen.queryByTestId('boundary')).not.toBeInTheDocument()
    await vi.waitFor(() =>
      expect(screen.getByTestId('out')).toHaveTextContent('1:true:false:loadMore failed'),
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'expand'}))
      fireEvent.click(screen.getByRole('button', {name: 'refetch'}))
    })

    expect(expandDocumentHistoryEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({documentId: 'doc-1'}),
      'rev-1',
    )
    expect(refetchDocumentHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({documentId: 'doc-1'}),
    )
  })

  it('marks synchronous SDK errors via withSdkOrigin', () => {
    const sdkFailure = new Error('Store selector boom')
    setupMockSources({
      getEvents: () => {
        throw sdkFailure
      },
    })

    let caughtError: unknown
    function View() {
      useDocumentHistory(HANDLE)
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

    expect(caughtError).toBe(sdkFailure)
    expect(Object.hasOwn(sdkFailure, Symbol.for('@sanity/sdk/errorOrigin'))).toBe(true)
  })
})
