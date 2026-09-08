import {
  type CommentsOptions,
  type CommentThread,
  getDocumentCommentsState,
  resolveDocumentComments,
  type StateSource,
} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useDocumentComments} from './useDocumentComments'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, getDocumentCommentsState: vi.fn(), resolveDocumentComments: vi.fn()}
})

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

function thread(threadId: string) {
  return {threadId, commentsCount: 2, fieldPath: ''} as CommentThread
}

/**
 * Stands in for the store, one source per option set so a test can hold one
 * document loaded and another not.
 *
 * `getCurrent` must hand back the same array every call for a given option set.
 * Returning a fresh one sends `useSyncExternalStore` into a render loop, which
 * is why the store memoises its selectors.
 */
function mockSource(
  getCurrent: (options: CommentsOptions) => CommentThread[] | undefined,
  changed$?: Subject<void>,
) {
  vi.mocked(getDocumentCommentsState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => getCurrent(options),
        subscribe: vi.fn((cb?: () => void) => {
          const subscription = changed$?.subscribe(() => cb?.())
          return () => subscription?.unsubscribe()
        }),
        get observable(): Observable<CommentThread[] | undefined> {
          throw new Error('Not implemented')
        },
      }) as StateSource<CommentThread[] | undefined>,
  )
}

/** Hoisted so the context value stays identical across renders. */
const RELEASE_PERSPECTIVE = {releaseName: 'summer'}

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading…</p>}>
      <ResourcesContext.Provider value={{other: {projectId: 'p2', dataset: 'd2'}}}>
        <Suspense fallback={<p data-testid="suspended">Suspended</p>}>{children}</Suspense>
      </ResourcesContext.Provider>
    </ResourceProvider>
  )
}

function PerspectiveWrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider
      projectId="p"
      dataset="d"
      perspective={RELEASE_PERSPECTIVE}
      fallback={<p>Loading…</p>}
    >
      <Suspense fallback={<p data-testid="suspended">Suspended</p>}>{children}</Suspense>
    </ResourceProvider>
  )
}

describe('useDocumentComments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the threads once they are loaded', () => {
    const loaded = [thread('t1'), thread('t2')]
    mockSource(() => loaded)

    function TestComponent() {
      const {threads, isPending} = useDocumentComments(HANDLE)
      return <div data-testid="out">{`${threads.length} ${isPending ? 'pending' : 'idle'}`}</div>
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(screen.getByTestId('out').textContent).toBe('2 idle')
  })

  it('suspends until the first snapshot arrives', async () => {
    const loaded = [thread('t1')]
    const ref: {current: CommentThread[] | undefined} = {current: undefined}
    const changed$ = new Subject<void>()
    mockSource(() => ref.current, changed$)

    let settle: () => void = () => {}
    vi.mocked(resolveDocumentComments).mockReturnValue(
      new Promise<CommentThread[]>((resolve) => {
        settle = () => resolve(loaded)
      }),
    )

    function TestComponent() {
      const {threads} = useDocumentComments(HANDLE)
      return <div data-testid="out">{threads.length}</div>
    }

    render(<TestComponent />, {wrapper: Wrapper})
    expect(screen.getByTestId('suspended')).toBeInTheDocument()

    await act(async () => {
      ref.current = loaded
      settle()
    })

    expect(screen.getByTestId('out').textContent).toBe('1')
  })

  it('passes the field path, status, and variants through to the store', () => {
    const loaded: CommentThread[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useDocumentComments({
        ...HANDLE,
        fieldPath: ['body', {_key: 'intro'}],
        status: 'resolved',
        variants: 'all',
      })
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getDocumentCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-1',
        fieldPath: 'body[_key=="intro"]',
        status: 'resolved',
        variants: 'all',
        resource: {projectId: 'p', dataset: 'd'},
      }),
    )
  })

  it('passes a per-call organization through to the store', () => {
    // Comments live in an organization store rather than the dataset, so a call
    // reading another organization's comments has to say so and be believed.
    const loaded: CommentThread[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useDocumentComments({...HANDLE, collaboration: {organizationId: 'org-2'}})
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getDocumentCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({collaboration: {organizationId: 'org-2'}}),
    )
  })

  it('resolves a named resource from context', () => {
    const loaded: CommentThread[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useDocumentComments({...HANDLE, resourceName: 'other'})
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getDocumentCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({resource: {projectId: 'p2', dataset: 'd2'}}),
    )
  })

  it('fills in the perspective from context', () => {
    // The perspective decides which of a document's variants the default
    // `variants` covers, so dropping it here would quietly read a release's
    // comments as if they were the draft's.
    const loaded: CommentThread[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useDocumentComments(HANDLE)
      return null
    }

    render(<TestComponent />, {wrapper: PerspectiveWrapper})

    expect(getDocumentCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({perspective: RELEASE_PERSPECTIVE}),
    )
  })

  it('keeps the previous list on screen while a different document loads', async () => {
    const first = [thread('t1')]
    const second = [thread('t2'), thread('t3')]
    // Only `doc-1` is loaded, so switching to `doc-2` has to suspend.
    const byDocument: Record<string, CommentThread[] | undefined> = {'doc-1': first}
    mockSource((options) => byDocument[options.documentId])

    let settle: () => void = () => {}
    vi.mocked(resolveDocumentComments).mockReturnValue(
      new Promise<CommentThread[]>((resolve) => {
        settle = () => resolve(second)
      }),
    )

    function TestComponent({documentId}: {documentId: string}) {
      const {threads, isPending} = useDocumentComments({...HANDLE, documentId})
      return <div data-testid="out">{`${threads.length} ${isPending ? 'pending' : 'idle'}`}</div>
    }

    const {rerender} = render(<TestComponent documentId="doc-1" />, {wrapper: Wrapper})
    expect(screen.getByTestId('out').textContent).toBe('1 idle')

    await act(async () => {
      rerender(<TestComponent documentId="doc-2" />)
    })

    // The swap happens inside a transition, so the render that suspends is
    // thrown away rather than falling back: `doc-1` stays on screen and
    // `isPending` is what reports the switch.
    expect(screen.queryByTestId('suspended')).not.toBeInTheDocument()
    expect(screen.getByTestId('out').textContent).toBe('1 pending')
    expect(getDocumentCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({documentId: 'doc-2'}),
    )

    await act(async () => {
      byDocument['doc-2'] = second
      settle()
    })

    expect(screen.getByTestId('out').textContent).toBe('2 idle')
  })
})
