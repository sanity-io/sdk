import {
  type CommentThread,
  getCommentThreadsState,
  resolveCommentThreads,
  type StateSource,
} from '@sanity/sdk'
import {act, render, screen} from '@testing-library/react'
import {Suspense} from 'react'
import {type Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useCommentThreads} from './useCommentThreads'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {...original, getCommentThreadsState: vi.fn(), resolveCommentThreads: vi.fn()}
})

const HANDLE = {documentId: 'doc-1', documentType: 'author'}

function thread(threadId: string) {
  return {threadId, commentsCount: 2, fieldPath: ''} as CommentThread
}

function mockSource(getCurrent: () => CommentThread[] | undefined) {
  vi.mocked(getCommentThreadsState).mockReturnValue({
    getCurrent,
    subscribe: vi.fn(() => () => {}),
    get observable(): Observable<CommentThread[] | undefined> {
      throw new Error('Not implemented')
    },
  } as StateSource<CommentThread[] | undefined>)
}

function Wrapper({children}: {children: React.ReactNode}) {
  return (
    <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading…</p>}>
      <Suspense fallback={<p data-testid="suspended">Suspended</p>}>{children}</Suspense>
    </ResourceProvider>
  )
}

describe('useCommentThreads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the threads once they are loaded', () => {
    const loaded = [thread('t1'), thread('t2')]
    mockSource(() => loaded)

    function TestComponent() {
      const {threads, isPending} = useCommentThreads(HANDLE)
      return <div data-testid="out">{`${threads.length} ${isPending ? 'pending' : 'idle'}`}</div>
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(screen.getByTestId('out').textContent).toBe('2 idle')
  })

  it('suspends until the threads are available', async () => {
    const loaded = [thread('t1')]
    const ref: {current: CommentThread[] | undefined} = {current: undefined}
    mockSource(() => ref.current)

    let settle: () => void = () => {}
    vi.mocked(resolveCommentThreads).mockReturnValue(
      new Promise<CommentThread[]>((resolve) => {
        settle = () => resolve(loaded)
      }),
    )

    function TestComponent() {
      const {threads} = useCommentThreads(HANDLE)
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

  it('narrows to one field when asked', () => {
    const loaded: CommentThread[] = []
    mockSource(() => loaded)

    function TestComponent() {
      useCommentThreads({...HANDLE, fieldPath: 'title'})
      return null
    }

    render(<TestComponent />, {wrapper: Wrapper})

    expect(getCommentThreadsState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({fieldPath: 'title'}),
    )
  })
})
