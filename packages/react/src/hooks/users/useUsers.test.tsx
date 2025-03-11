import {
  getUsersState,
  loadMoreUsers,
  resolveUsers,
  type SanityUser,
  type StateSource,
  type UserProfile,
} from '@sanity/sdk'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {Suspense, useState} from 'react'
import {type Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useUsers} from './useUsers'

// Mock the functions from '@sanity/sdk'
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getUsersState: vi.fn(),
    resolveUsers: vi.fn(),
    loadMoreUsers: vi.fn(),
  }
})

// Mock the Sanity instance hook to return a dummy instance
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: vi.fn().mockReturnValue({}),
}))

describe('useUsers', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // Create mock user profiles with all required fields
  const mockUserProfile1: UserProfile = {
    id: 'profile1',
    displayName: 'User One',
    email: 'user1@example.com',
    imageUrl: 'https://example.com/user1.jpg',
    provider: 'google',
    createdAt: '2023-01-01T00:00:00Z',
  }

  const mockUserProfile2: UserProfile = {
    id: 'profile2',
    displayName: 'User Two',
    email: 'user2@example.com',
    imageUrl: 'https://example.com/user2.jpg',
    provider: 'github',
    createdAt: '2023-01-02T00:00:00Z',
  }

  const mockUsers: SanityUser[] = [
    {
      sanityUserId: 'user1',
      profile: mockUserProfile1,
      memberships: [],
    },
    {
      sanityUserId: 'user2',
      profile: mockUserProfile2,
      memberships: [],
    },
  ]

  it('should render users data immediately when available', () => {
    const getCurrent = vi.fn().mockReturnValue({
      data: mockUsers,
      hasMore: false,
      totalCount: 2,
    })

    // Type assertion to fix the StateSource type issue
    vi.mocked(getUsersState).mockReturnValue({
      getCurrent,
      subscribe: vi.fn(),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as unknown as StateSource<
      {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined
    >)

    function TestComponent() {
      const {data, hasMore, isPending} = useUsers({
        resourceType: 'organization',
        resourceId: 'test-org',
        limit: 10,
      })
      return (
        <div data-testid="output">
          {data.length} users - {hasMore ? 'has more' : 'no more'} -{' '}
          {isPending ? 'pending' : 'not pending'}
        </div>
      )
    }

    render(<TestComponent />)

    // Verify that the output contains the data and that isPending is false
    expect(screen.getByTestId('output').textContent).toContain('2 users')
    expect(screen.getByTestId('output').textContent).toContain('no more')
    expect(screen.getByTestId('output').textContent).toContain('not pending')
  })

  it('should suspend rendering until users data is resolved via Suspense', async () => {
    const ref = {
      current: undefined as {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined,
    }
    const getCurrent = vi.fn(() => ref.current)
    const storeChanged$ = new Subject<void>()

    // Type assertion to fix the StateSource type issue
    vi.mocked(getUsersState).mockReturnValue({
      getCurrent,
      subscribe: vi.fn((cb) => {
        const subscription = storeChanged$.subscribe(cb)
        return () => subscription.unsubscribe()
      }),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as unknown as StateSource<
      {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined
    >)

    // Create a controllable promise to simulate the users resolution
    let resolvePromise: () => void
    // Mock resolveUsers to return our fake promise
    vi.mocked(resolveUsers).mockReturnValue(
      new Promise<{data: SanityUser[]; totalCount: number; hasMore: boolean}>((resolve) => {
        resolvePromise = () => {
          ref.current = {
            data: mockUsers,
            hasMore: true,
            totalCount: 2,
          }
          storeChanged$.next()
          resolve(ref.current)
        }
      }),
    )

    function TestComponent() {
      const {data} = useUsers({
        resourceType: 'organization',
        resourceId: 'test-org',
        limit: 10,
      })
      return (
        <div data-testid="output">{data.map((user) => user.profile.displayName).join(', ')}</div>
      )
    }

    render(
      <Suspense fallback={<div data-testid="fallback">Loading...</div>}>
        <TestComponent />
      </Suspense>,
    )

    // Initially, since storeValue is undefined, the component should suspend and fallback is shown
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    // Now simulate that data becomes available
    await act(async () => {
      resolvePromise()
    })

    expect(screen.getByTestId('output').textContent).toContain('User One, User Two')
  })

  it('should display transition pending state during options change', async () => {
    const ref = {
      current: undefined as {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined,
    }
    const getCurrent = vi.fn(() => ref.current)
    const storeChanged$ = new Subject<void>()

    // Use a more specific type for the mock implementation
    vi.mocked(getUsersState).mockImplementation((_instance, options) => {
      if (options.resourceId === 'org1') {
        return {
          getCurrent: vi.fn().mockReturnValue({
            data: [mockUsers[0]],
            hasMore: false,
            totalCount: 1,
          }),
          subscribe: vi.fn(),
          get observable(): Observable<unknown> {
            throw new Error('Not implemented')
          },
        } as unknown as StateSource<
          {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined
        >
      }

      return {
        getCurrent,
        subscribe: vi.fn((cb) => {
          const subscription = storeChanged$.subscribe(cb)
          return () => subscription.unsubscribe()
        }),
        get observable(): Observable<unknown> {
          throw new Error('Not implemented')
        },
      } as unknown as StateSource<
        {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined
      >
    })

    // Create a controllable promise to simulate the users resolution
    let resolvePromise: () => void
    // Mock resolveUsers to return our fake promise
    vi.mocked(resolveUsers).mockReturnValue(
      new Promise<{data: SanityUser[]; totalCount: number; hasMore: boolean}>((resolve) => {
        resolvePromise = () => {
          ref.current = {
            data: [mockUsers[1]],
            hasMore: true,
            totalCount: 1,
          }
          storeChanged$.next()
          resolve(ref.current)
        }
      }),
    )

    function WrapperComponent() {
      const [orgId, setOrgId] = useState('org1')
      const {data, hasMore, isPending} = useUsers({
        resourceType: 'organization',
        resourceId: orgId,
        limit: 10,
      })
      return (
        <div>
          <div data-testid="output">
            {data.map((user) => user.profile.displayName).join(', ')} -
            {hasMore ? 'has more' : 'no more'} -{isPending ? 'pending' : 'not pending'}
          </div>
          <button data-testid="button" onClick={() => setOrgId('org2')}>
            Change Organization
          </button>
        </div>
      )
    }

    render(<WrapperComponent />)

    // Initially, should show data for org1 and not pending
    expect(screen.getByTestId('output').textContent).toContain('User One')
    expect(screen.getByTestId('output').textContent).toContain('no more')
    expect(screen.getByTestId('output').textContent).toContain('not pending')

    // Trigger organization change to "org2"
    act(() => {
      screen.getByTestId('button').click()
    })

    // Immediately after clicking, deferredKey is still for org1,
    // so the hook returns data from the previous org ('User One') but isPending should now be true.
    expect(screen.getByTestId('output').textContent).toContain('User One')
    expect(screen.getByTestId('output').textContent).toContain('pending')

    // Simulate the completion of the transition.
    await act(async () => {
      resolvePromise()
    })

    // Now, the component should render with the new deferred options and display new data.
    expect(screen.getByTestId('output').textContent).toContain('User Two')
    expect(screen.getByTestId('output').textContent).toContain('has more')
    expect(screen.getByTestId('output').textContent).toContain('not pending')
  })

  it('should call loadMoreUsers when loadMore is called', () => {
    const getCurrent = vi.fn().mockReturnValue({
      data: mockUsers,
      hasMore: true,
      totalCount: 2,
    })

    // Type assertion to fix the StateSource type issue
    vi.mocked(getUsersState).mockReturnValue({
      getCurrent,
      subscribe: vi.fn(),
      get observable(): Observable<unknown> {
        throw new Error('Not implemented')
      },
    } as unknown as StateSource<
      {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined
    >)

    function TestComponent() {
      const {data, hasMore, loadMore} = useUsers({
        resourceType: 'organization',
        resourceId: 'test-org',
        limit: 10,
      })
      return (
        <div>
          <div data-testid="output">
            {data.length} users - {hasMore ? 'has more' : 'no more'}
          </div>
          <button data-testid="load-more" onClick={loadMore}>
            Load More
          </button>
        </div>
      )
    }

    render(<TestComponent />)

    // Verify initial state
    expect(screen.getByTestId('output').textContent).toContain('2 users')
    expect(screen.getByTestId('output').textContent).toContain('has more')

    // Click the load more button
    fireEvent.click(screen.getByTestId('load-more'))

    // Verify that loadMoreUsers was called with the correct arguments
    expect(loadMoreUsers).toHaveBeenCalledWith(undefined, {
      resourceType: 'organization',
      resourceId: 'test-org',
      limit: 10,
    })
  })
})
