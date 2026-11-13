import {
  getUsersState,
  resolveUsers,
  type SanityUser,
  type StateSource,
  type UserProfile,
} from '@sanity/sdk'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {useState} from 'react'
import {type Observable, Subject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useUser} from './useUser'

// Mock the functions from '@sanity/sdk'
vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getUsersState: vi.fn(),
    resolveUsers: vi.fn(),
  }
})

describe('useUser', () => {
  // Create mock user profiles with all required fields
  const mockUserProfile: UserProfile = {
    id: 'profile1',
    displayName: 'John Doe',
    email: 'john.doe@example.com',
    imageUrl: 'https://example.com/john.jpg',
    provider: 'google',
    createdAt: '2023-01-01T00:00:00Z',
  }

  const mockUser: SanityUser = {
    sanityUserId: 'gabc123',
    profile: mockUserProfile,
    memberships: [],
  }

  const mockUserProfile2: UserProfile = {
    id: 'profile2',
    displayName: 'Jane Smith',
    email: 'jane.smith@example.com',
    imageUrl: 'https://example.com/jane.jpg',
    provider: 'github',
    createdAt: '2023-01-02T00:00:00Z',
  }

  const mockUser2: SanityUser = {
    sanityUserId: 'gdef456',
    profile: mockUserProfile2,
    memberships: [],
  }

  it('should render user data immediately when available', () => {
    const getCurrent = vi.fn().mockReturnValue({
      data: [mockUser],
      hasMore: false,
      totalCount: 1,
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
      const {data, isPending} = useUser({
        userId: 'gabc123',
        resourceType: 'organization',
        organizationId: 'test-org',
      })
      return (
        <div data-testid="output">
          {data ? `${data.profile.displayName} (${data.sanityUserId})` : 'No user'} -{' '}
          {isPending ? 'pending' : 'not pending'}
        </div>
      )
    }

    render(
      <ResourceProvider projectId="p" fallback={null}>
        <TestComponent />
      </ResourceProvider>,
    )

    // Verify that the output contains the user data and that isPending is false
    expect(screen.getByTestId('output').textContent).toContain('John Doe (gabc123)')
    expect(screen.getByTestId('output').textContent).toContain('not pending')
  })

  it('should suspend rendering until user data is resolved via Suspense', async () => {
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

    // Create a controllable promise to simulate the user resolution
    let resolvePromise: () => void
    // Mock resolveUsers to return our fake promise
    vi.mocked(resolveUsers).mockReturnValue(
      new Promise<{data: SanityUser[]; totalCount: number; hasMore: boolean}>((resolve) => {
        resolvePromise = () => {
          ref.current = {
            data: [mockUser],
            hasMore: false,
            totalCount: 1,
          }
          storeChanged$.next()
          resolve(ref.current)
        }
      }),
    )

    function TestComponent() {
      const {data} = useUser({
        userId: 'gabc123',
        resourceType: 'organization',
        organizationId: 'test-org',
      })
      return <div data-testid="output">{data?.profile.displayName || 'No user'}</div>
    }

    render(
      <ResourceProvider fallback={<div data-testid="fallback">Loading...</div>}>
        <TestComponent />
      </ResourceProvider>,
    )

    // Initially, since storeValue is undefined, the component should suspend and fallback is shown
    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    // Now simulate that data becomes available
    await act(async () => {
      resolvePromise()
    })

    expect(screen.getByTestId('output').textContent).toContain('John Doe')
  })

  it('should display transition pending state during options change', async () => {
    const ref = {
      current: undefined as {data: SanityUser[]; totalCount: number; hasMore: boolean} | undefined,
    }
    const getCurrent = vi.fn(() => ref.current)
    const storeChanged$ = new Subject<void>()

    // Use a more specific type for the mock implementation
    vi.mocked(getUsersState).mockImplementation((_instance, options) => {
      if (options?.userId === 'gabc123') {
        return {
          getCurrent: vi.fn().mockReturnValue({
            data: [mockUser],
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

    // Create a controllable promise to simulate the user resolution
    let resolvePromise: () => void
    // Mock resolveUsers to return our fake promise
    vi.mocked(resolveUsers).mockReturnValue(
      new Promise<{data: SanityUser[]; totalCount: number; hasMore: boolean}>((resolve) => {
        resolvePromise = () => {
          ref.current = {
            data: [mockUser2],
            hasMore: false,
            totalCount: 1,
          }
          storeChanged$.next()
          resolve(ref.current)
        }
      }),
    )

    function WrapperComponent() {
      const [userId, setUserId] = useState('gabc123')
      const {data, isPending} = useUser({
        userId,
        resourceType: 'organization',
        organizationId: 'test-org',
      })
      return (
        <div>
          <div data-testid="output">
            {data?.profile.displayName || 'No user'} - {isPending ? 'pending' : 'not pending'}
          </div>
          <button data-testid="button" onClick={() => setUserId('gdef456')}>
            Change User
          </button>
        </div>
      )
    }

    render(
      <ResourceProvider fallback={null}>
        <WrapperComponent />
      </ResourceProvider>,
    )

    // Initially, should show data for first user and not pending
    expect(screen.getByTestId('output').textContent).toContain('John Doe')
    expect(screen.getByTestId('output').textContent).toContain('not pending')

    // Change the user ID, which should trigger a transition
    fireEvent.click(screen.getByTestId('button'))

    // The isPending should become true during the transition
    expect(screen.getByTestId('output').textContent).toContain('pending')

    // Resolve the promise to complete the transition
    await act(async () => {
      resolvePromise()
    })

    // After transition, should show new user data and not pending
    expect(screen.getByTestId('output').textContent).toContain('Jane Smith')
    expect(screen.getByTestId('output').textContent).toContain('not pending')
  })

  it('should handle undefined user data gracefully', () => {
    const getCurrent = vi.fn().mockReturnValue({
      data: [], // Empty array means no user found
      hasMore: false,
      totalCount: 0,
    })

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
      const {data, isPending} = useUser({
        userId: 'nonexistent123',
        resourceType: 'organization',
        organizationId: 'test-org',
      })
      return (
        <div data-testid="output">
          {data ? `Found: ${data.profile.displayName}` : 'User not found'} -{' '}
          {isPending ? 'pending' : 'not pending'}
        </div>
      )
    }

    render(
      <ResourceProvider fallback={null}>
        <TestComponent />
      </ResourceProvider>,
    )

    expect(screen.getByTestId('output').textContent).toContain('User not found')
    expect(screen.getByTestId('output').textContent).toContain('not pending')
  })

  it('should work with project-scoped user IDs', () => {
    const projectUser: SanityUser = {
      ...mockUser,
      sanityUserId: 'p12345',
    }

    const getCurrent = vi.fn().mockReturnValue({
      data: [projectUser],
      hasMore: false,
      totalCount: 1,
    })

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
      const {data} = useUser({
        userId: 'p12345',
        resourceType: 'project',
        projectId: 'test-project',
      })
      return (
        <div data-testid="output">
          {data ? `${data.profile.displayName} (${data.sanityUserId})` : 'No user'}
        </div>
      )
    }

    render(
      <ResourceProvider projectId="test-project" fallback={null}>
        <TestComponent />
      </ResourceProvider>,
    )

    expect(screen.getByTestId('output').textContent).toContain('John Doe (p12345)')
  })

  it('should handle resource type changes', () => {
    vi.mocked(getUsersState).mockImplementation((_instance, options) => {
      const mockData = options?.resourceType === 'project' ? [mockUser] : [mockUser2]

      return {
        getCurrent: vi.fn().mockReturnValue({
          data: mockData,
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
    })

    function WrapperComponent() {
      const [resourceType, setResourceType] = useState<'project' | 'organization'>('project')
      const {data} = useUser({
        userId: 'gabc123',
        resourceType,
        ...(resourceType === 'project'
          ? {projectId: 'test-project'}
          : {organizationId: 'test-org'}),
      })
      return (
        <div>
          <div data-testid="output">{data?.profile.displayName || 'No user'}</div>
          <button data-testid="toggle" onClick={() => setResourceType('organization')}>
            Switch to Organization
          </button>
        </div>
      )
    }

    render(
      <ResourceProvider projectId="test-project" fallback={null}>
        <WrapperComponent />
      </ResourceProvider>,
    )

    // Initially should show project user
    expect(screen.getByTestId('output').textContent).toContain('John Doe')

    // Switch resource type
    fireEvent.click(screen.getByTestId('toggle'))

    // Should now show organization user
    expect(screen.getByTestId('output').textContent).toContain('Jane Smith')
  })
})
