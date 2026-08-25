import {
  type Comment,
  type CommentsOptions,
  getCommentsState,
  resolveComments,
  type StateSource,
} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useComments} from './useComments'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, getCommentsState: vi.fn(), resolveComments: vi.fn()}
})

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

function comment(id: string): Comment {
  return {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    authorId: 'user-1',
    message: null,
    threadId: 'thread-1',
    status: 'open',
    documentId: 'doc-1',
    documentType: 'author',
    fieldPath: '',
    reactions: [],
  }
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
  getCurrent: (options: CommentsOptions) => Comment[] | undefined,
  changed$?: Subject<void>,
) {
  vi.mocked(getCommentsState).mockImplementation(
    (_instance, options) =>
      ({
        getCurrent: () => getCurrent(options),
        subscribe: vi.fn((cb?: () => void) => {
          const subscription = changed$?.subscribe(() => cb?.())
          return () => subscription?.unsubscribe()
        }),
        get observable(): Observable<Comment[] | undefined> {
          throw new Error('Not implemented')
        },
      }) as StateSource<Comment[] | undefined>,
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

describe('useComments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the comments once they are loaded', () => {
    const loaded = [comment('a'), comment('b')]
    mockSource(() => loaded)

    function TestComponent() {
      const {comments, isPending} = useComments(HANDLE)
      return <div data-testid="out">{`${comments.length} ${isPending ? 'pending' : 'idle'}`}</div>
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(screen.getByTestId('out').textContent).toBe('2 idle')
  })

  it('suspends until the first snapshot arrives', async () => {
    const loaded = [comment('a')]
    const ref: {current: Comment[] | undefined} = {current: undefined}
    const changed$ = new Subject<void>()
    mockSource(() => ref.current, changed$)

    let settle: () => void = () => {}
    vi.mocked(resolveComments).mockReturnValue(
      new Promise<Comment[]>((resolve) => {
        settle = () => resolve(loaded)
      }),
    )

    function TestComponent() {
      const {comments} = useComments(HANDLE)
      return <div data-testid="out">{comments.length}</div>
    }

    render(<TestComponent />, {wrapper: Wrapper})
    expect(screen.getByTestId('suspended')).toBeInTheDocument()

    await act(async () => {
      ref.current = loaded
      settle()
    })

    expect(screen.getByTestId('out').textContent).toBe('1')
  })

  it('passes the field path and status through to the store', () => {
    const loaded: Comment[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useComments({...HANDLE, fieldPath: ['body', {_key: 'intro'}], status: 'resolved'})
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-1',
        fieldPath: 'body[_key=="intro"]',
        status: 'resolved',
        resource: {projectId: 'p', dataset: 'd'},
      }),
    )
  })

  it('resolves a named resource from context', () => {
    const loaded: Comment[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useComments({...HANDLE, resourceName: 'other'})
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({resource: {projectId: 'p2', dataset: 'd2'}}),
    )
  })

  it('fills in the perspective from context', () => {
    // Core turns a release perspective into `target.documentVersionId` and into
    // the key the list is stored under, so dropping it here would read and
    // write the wrong release with nothing to show that anything went wrong.
    const loaded: Comment[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useComments(HANDLE)
      return null
    }

    render(<TestComponent />, {wrapper: PerspectiveWrapper})

    expect(getCommentsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({perspective: RELEASE_PERSPECTIVE}),
    )
  })

  it('keeps the previous list on screen while a different document loads', async () => {
    const first = [comment('a')]
    const second = [comment('b'), comment('c')]
    // Only `doc-1` is loaded, so switching to `doc-2` has to suspend.
    const byDocument: Record<string, Comment[] | undefined> = {'doc-1': first}
    mockSource((options) => byDocument[options.documentId])

    let settle: () => void = () => {}
    vi.mocked(resolveComments).mockReturnValue(
      new Promise<Comment[]>((resolve) => {
        settle = () => resolve(second)
      }),
    )

    function TestComponent({documentId}: {documentId: string}) {
      const {comments, isPending} = useComments({...HANDLE, documentId})
      return <div data-testid="out">{`${comments.length} ${isPending ? 'pending' : 'idle'}`}</div>
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
    expect(getCommentsState).toHaveBeenCalledWith(
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
