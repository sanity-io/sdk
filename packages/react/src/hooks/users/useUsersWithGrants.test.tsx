import {
  getUsersWithGrantsState,
  loadMoreUsersWithGrants,
  resolveUsersWithGrants,
  type StateSource,
  type UserProfile,
  type UsersWithGrantsResult,
  type UserWithGrants,
} from '@sanity/sdk'
import {act, fireEvent, render, screen} from '@testing-library/react'
import {type Observable, Subject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useUsersWithGrants} from './useUsersWithGrants'

vi.mock('@sanity/sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/sdk')>()
  return {
    ...original,
    getUsersWithGrantsState: vi.fn(),
    resolveUsersWithGrants: vi.fn(),
    loadMoreUsersWithGrants: vi.fn(),
  }
})

type GrantsStateSource = StateSource<UsersWithGrantsResult | undefined>

const profile = (id: string, displayName: string): UserProfile => ({
  id,
  displayName,
  email: `${id}@example.com`,
  provider: 'google',
  createdAt: '2023-01-01T00:00:00Z',
})

const mockUsers: UserWithGrants[] = [
  {sanityUserId: 'user1', profile: profile('profile1', 'User One'), memberships: [], granted: true},
  {
    sanityUserId: 'user2',
    profile: profile('profile2', 'User Two'),
    memberships: [],
    granted: false,
  },
]

const document = {documentId: 'article-1', documentType: 'article'}

// `useSyncExternalStore` loops if a snapshot isn't referentially stable, which
// is why these read from a fixed value rather than building one per call.
const mockState = (
  getCurrent: () => UsersWithGrantsResult | undefined,
  subscribe: (onStoreChanged: () => void) => () => void = () => () => {},
) =>
  vi.mocked(getUsersWithGrantsState).mockReturnValue({
    getCurrent,
    subscribe: vi.fn(subscribe),
    get observable(): Observable<unknown> {
      throw new Error('Not implemented')
    },
  } as unknown as GrantsStateSource)

const mockStaticState = (result: UsersWithGrantsResult) => mockState(() => result)

describe('useUsersWithGrants', () => {
  it('renders each user with its grant when data is already available', () => {
    mockStaticState({data: mockUsers, hasMore: false, totalCount: 2})

    function TestComponent() {
      const {data} = useUsersWithGrants({document})
      return (
        <ul data-testid="output">
          {data.map((user) => (
            <li key={user.sanityUserId}>
              {user.profile.displayName}
              {user.granted ? ' granted' : ' denied'}
            </li>
          ))}
        </ul>
      )
    }

    render(
      <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
        <TestComponent />
      </ResourceProvider>,
    )

    expect(screen.getByTestId('output').textContent).toBe('User One grantedUser Two denied')
  })

  it('suspends until the users and their grants resolve', async () => {
    const ref = {current: undefined as UsersWithGrantsResult | undefined}
    const storeChanged$ = new Subject<void>()

    mockState(
      () => ref.current,
      (cb) => {
        const subscription = storeChanged$.subscribe(cb)
        return () => subscription.unsubscribe()
      },
    )

    let resolvePromise: () => void
    vi.mocked(resolveUsersWithGrants).mockReturnValue(
      new Promise<UsersWithGrantsResult>((resolve) => {
        resolvePromise = () => {
          ref.current = {data: mockUsers, hasMore: true, totalCount: 2}
          storeChanged$.next()
          resolve(ref.current)
        }
      }),
    )

    function TestComponent() {
      const {data} = useUsersWithGrants({document})
      return (
        <div data-testid="output">{data.map((user) => user.profile.displayName).join(', ')}</div>
      )
    }

    render(
      <ResourceProvider
        projectId="p"
        dataset="d"
        fallback={<div data-testid="fallback">Loading...</div>}
      >
        <TestComponent />
      </ResourceProvider>,
    )

    expect(screen.getByTestId('fallback')).toBeInTheDocument()

    await act(async () => {
      resolvePromise()
    })

    expect(screen.getByTestId('output').textContent).toContain('User One, User Two')
  })

  it('pages over the unfiltered list, so denied users still count towards hasMore', () => {
    mockStaticState({data: mockUsers, hasMore: true, totalCount: 2})

    function TestComponent() {
      const {data, hasMore, loadMore} = useUsersWithGrants({batchSize: 10, document})
      return (
        <div>
          <div data-testid="output">
            {data.length} users, {data.filter((user) => user.granted).length} granted,{' '}
            {hasMore ? 'has more' : 'no more'}
          </div>
          <button data-testid="load-more" onClick={loadMore}>
            Load More
          </button>
        </div>
      )
    }

    render(
      <ResourceProvider projectId="p" dataset="d" fallback={<p>Loading...</p>}>
        <TestComponent />
      </ResourceProvider>,
    )

    expect(screen.getByTestId('output').textContent).toBe('2 users, 1 granted, has more')

    fireEvent.click(screen.getByTestId('load-more'))

    expect(loadMoreUsersWithGrants).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        batchSize: 10,
        document: expect.objectContaining({resource: {projectId: 'p', dataset: 'd'}}),
      }),
    )
  })

  it('resolves the document handle against the ambient resource', () => {
    // The document's own resource is what decides the audience as well, so this
    // is the only thing that has to be resolved for the read to reach the right
    // project's users and access groups.
    mockStaticState({data: mockUsers, hasMore: false, totalCount: 2})

    function TestComponent() {
      useUsersWithGrants({document})
      return null
    }

    render(
      <ResourceProvider
        resource={{projectId: 'resource-project', dataset: 'production'}}
        fallback={null}
      >
        <TestComponent />
      </ResourceProvider>,
    )

    expect(getUsersWithGrantsState).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        document: expect.objectContaining({
          documentId: 'article-1',
          resource: {projectId: 'resource-project', dataset: 'production'},
        }),
      }),
    )
  })
})
