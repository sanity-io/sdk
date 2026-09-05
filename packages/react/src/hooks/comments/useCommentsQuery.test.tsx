import {
  type Comment,
  type CommentsQueryOptions,
  getCommentsQueryState,
  resolveCommentsQuery,
  type StateSource,
} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useCommentsQuery} from './useCommentsQuery'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, getCommentsQueryState: vi.fn(), resolveCommentsQuery: vi.fn()}
})

function comment(id: string): Comment {
  return {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    authorId: 'user-1',
    message: [{_type: 'block', _key: 'b1', children: [{_type: 'span', text: 'hello'}]}],
    threadId: 'thread-1',
    status: 'open',
    documentId: 'doc-1',
    sourceDocumentId: 'doc-1',
    documentType: 'author',
    fieldPath: 'title',
    reactions: [],
  }
}

/** See the equivalent in `useDocumentComments.test.tsx` for why this is keyed. */
function mockSource(
  getCurrent: (options: CommentsQueryOptions) => Comment[] | undefined,
  changed$?: Subject<void>,
) {
  vi.mocked(getCommentsQueryState).mockImplementation(
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

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading…</p>}>
      <ResourcesContext.Provider value={{other: {projectId: 'p2', dataset: 'd2'}}}>
        <Suspense fallback={<p data-testid="suspended">Suspended</p>}>{children}</Suspense>
      </ResourcesContext.Provider>
    </ResourceProvider>
  )
}

describe('useCommentsQuery', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the comments once they are loaded', () => {
    const loaded = [comment('a'), comment('b')]
    mockSource(() => loaded)

    function TestComponent() {
      const {comments, isPending} = useCommentsQuery({filter: 'status == "open"'})
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
    vi.mocked(resolveCommentsQuery).mockReturnValue(
      new Promise<Comment[]>((resolve) => {
        settle = () => resolve(loaded)
      }),
    )

    function TestComponent() {
      const {comments} = useCommentsQuery({filter: 'status == "open"'})
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

  it('passes the filter and its params through to the store', () => {
    const loaded: Comment[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useCommentsQuery({filter: '_system.createdBy == $userId', params: {userId: 'user-1'}})
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getCommentsQueryState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: '_system.createdBy == $userId',
        params: {userId: 'user-1'},
        resource: {projectId: 'p', dataset: 'd'},
      }),
    )
  })

  it('resolves a named resource from context', () => {
    const loaded: Comment[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useCommentsQuery({filter: 'status == "open"', resourceName: 'other'})
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getCommentsQueryState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({resource: {projectId: 'p2', dataset: 'd2'}}),
    )
  })

  it('re-reads when a param changes rather than only when the filter does', () => {
    // The filter is a template and the params are what it means, so keying on
    // the filter alone would leave a user's list showing another user's
    // comments.
    const loaded: Comment[] = []
    mockSource(() => loaded)

    function TestComponent({userId}: {userId: string}) {
      useCommentsQuery({filter: '_system.createdBy == $userId', params: {userId}})
      return null
    }

    const {rerender} = render(<TestComponent userId="user-1" />, {wrapper: Wrapper})
    rerender(<TestComponent userId="user-2" />)

    expect(getCommentsQueryState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({params: {userId: 'user-2'}}),
    )
  })

  it('keeps the previous list on screen while a different filter loads', async () => {
    const open = [comment('a')]
    const resolved = [comment('b'), comment('c')]
    const byFilter: Record<string, Comment[] | undefined> = {'status == "open"': open}
    mockSource((options) => byFilter[options.filter])

    let settle: () => void = () => {}
    vi.mocked(resolveCommentsQuery).mockReturnValue(
      new Promise<Comment[]>((resolve) => {
        settle = () => resolve(resolved)
      }),
    )

    function TestComponent({filter}: {filter: string}) {
      const {comments, isPending} = useCommentsQuery({filter})
      return <div data-testid="out">{`${comments.length} ${isPending ? 'pending' : 'idle'}`}</div>
    }

    const {rerender} = render(<TestComponent filter='status == "open"' />, {wrapper: Wrapper})
    expect(screen.getByTestId('out').textContent).toBe('1 idle')

    await act(async () => {
      rerender(<TestComponent filter='status == "resolved"' />)
    })

    expect(screen.queryByTestId('suspended')).not.toBeInTheDocument()
    expect(screen.getByTestId('out').textContent).toBe('1 pending')

    await act(async () => {
      byFilter['status == "resolved"'] = resolved
      settle()
    })

    expect(screen.getByTestId('out').textContent).toBe('2 idle')
  })
})
