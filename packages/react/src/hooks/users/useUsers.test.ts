import {type ResourceType, type User} from '@sanity/access-api'
import {createUsersStore} from '@sanity/sdk'
import {act, renderHook} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {useSanityInstance} from '../context/useSanityInstance'
import {useUsers} from './useUsers'

vi.mock('@sanity/sdk')
vi.mock('../context/useSanityInstance')

describe('useUsers', () => {
  const mockInstance = {}
  const mockUser: User = {
    profile: {
      id: 'user1',
      displayName: 'Test User',
      email: 'test@test.com',
      provider: 'test',
      createdAt: '2021-01-01',
    },
    sanityUserId: 'user1',
    memberships: [],
  }

  const getCurrent = vi.fn().mockReturnValue({
    users: [],
    totalCount: 0,
    nextCursor: null,
    hasMore: false,
    initialFetchCompleted: false,
    options: {
      resourceType: '' as ResourceType,
      resourceId: '',
      limit: 100,
    },
  })
  const unsubscribe = vi.fn()
  const subscribe = vi.fn().mockReturnValue(unsubscribe)
  const dispose = vi.fn()

  const mockUsersStore: ReturnType<typeof createUsersStore> = {
    setOptions: vi.fn(),
    loadMore: vi.fn(),
    resolveUsers: vi.fn(),
    getState: vi.fn().mockReturnValue({getCurrent, subscribe}),
    dispose,
  }

  beforeEach(() => {
    vi.mocked(useSanityInstance).mockReturnValue(
      mockInstance as unknown as ReturnType<typeof useSanityInstance>,
    )
    vi.mocked(createUsersStore).mockReturnValue(
      mockUsersStore as unknown as ReturnType<typeof createUsersStore>,
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with given params', () => {
    renderHook(() =>
      useUsers({
        resourceType: 'project',
        resourceId: 'proj1',
      }),
    )

    expect(createUsersStore).toHaveBeenCalledWith(mockInstance)
    expect(mockUsersStore.setOptions).toHaveBeenCalledWith({
      resourceType: 'project',
      resourceId: 'proj1',
    })
  })

  it('should subscribe to users store changes', () => {
    renderHook(() =>
      useUsers({
        resourceType: 'organization',
        resourceId: 'org1',
      }),
    )
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('should return current users state', () => {
    const mockState = {users: [mockUser], hasMore: true}
    getCurrent.mockReturnValue(mockState)

    const {result} = renderHook(() =>
      useUsers({
        resourceType: 'project',
        resourceId: 'proj1',
      }),
    )
    expect(result.current).toMatchObject(mockState)
  })

  it('should call loadMore when loadMore is invoked', () => {
    const {result} = renderHook(() =>
      useUsers({
        resourceType: 'project',
        resourceId: 'proj1',
      }),
    )

    act(() => {
      result.current.loadMore()
    })

    expect(mockUsersStore.loadMore).toHaveBeenCalled()
  })

  it('should update options when params change', () => {
    const initialParams = {resourceType: 'project' as ResourceType, resourceId: 'proj1'}
    const {rerender} = renderHook(({params}) => useUsers(params), {
      initialProps: {params: initialParams},
    })

    const newParams = {resourceType: 'organization' as ResourceType, resourceId: 'org1'}
    rerender({params: newParams})

    expect(mockUsersStore.setOptions).toHaveBeenCalledWith(newParams)
  })

  it('should resolve users if initial fetch not completed', () => {
    getCurrent.mockReturnValue({initialFetchCompleted: false})

    renderHook(() =>
      useUsers({
        resourceType: 'project',
        resourceId: 'proj1',
      }),
    )
    expect(mockUsersStore.resolveUsers).toHaveBeenCalled()
  })

  it('should not resolve users if initial fetch already completed', () => {
    getCurrent.mockReturnValue({initialFetchCompleted: true})

    renderHook(() =>
      useUsers({
        resourceType: 'project',
        resourceId: 'proj1',
      }),
    )
    expect(mockUsersStore.resolveUsers).not.toHaveBeenCalled()
  })

  it('should clean up store on unmount', () => {
    const {unmount} = renderHook(() =>
      useUsers({
        resourceType: 'project',
        resourceId: 'proj1',
      }),
    )

    unmount()
    expect(mockUsersStore.dispose).toHaveBeenCalled()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
