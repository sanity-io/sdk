import {type StateSource} from '@sanity/sdk'
import {
  type Comment,
  type CommentsOptions,
  getCommentsErrorState,
  getCommentsState,
  resolveComments,
} from '@sanity/sdk/collaboration'
import {act, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useComments} from './useComments'

vi.mock('@sanity/sdk/collaboration', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk/collaboration')>()
  return {
    ...original,
    getCommentsState: vi.fn(),
    getCommentsErrorState: vi.fn(),
    resolveComments: vi.fn(),
  }
})

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

function comment(id: string) {
  return {id, fieldPath: ''} as Comment
}

/**
 * Stands in for the store. `getCurrent` must hand back the same array every
 * call for a given option set, or `useSyncExternalStore` renders in a loop.
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
  vi.mocked(getCommentsErrorState).mockImplementation(
    () =>
      ({
        getCurrent: () => undefined,
        subscribe: vi.fn(() => () => {}),
        get observable(): Observable<unknown> {
          throw new Error('Not implemented')
        },
      }) as StateSource<unknown>,
  )
}

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading…</p>}>
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

  it('passes the field path, status, and variants through to the store', () => {
    const loaded: Comment[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useComments({
        ...HANDLE,
        fieldPath: ['body', {_key: 'intro'}],
        status: 'resolved',
        variants: 'all',
      })
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getCommentsState).toHaveBeenCalledWith(
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
})
