import {type SanityClient} from '@sanity/client'
import {delay, filter, firstValueFrom, Observable, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {type GetUsersOptions, type SanityUser, type SanityUserResponse} from './types'
import {getUsersState, loadMoreUsers, resolveUsers} from './usersStore'

vi.mock('./usersConstants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./usersConstants')>()),
  USERS_STATE_CLEAR_DELAY: 10,
}))

vi.mock('../client/clientStore')

describe('usersStore', () => {
  let request: SanityClient['observable']['request']

  const mockUsers: SanityUser[] = [
    {
      sanityUserId: 'user1',
      profile: {
        id: 'profile1',
        displayName: 'User 1',
        email: 'user1@example.com',
        provider: 'google',
        createdAt: '2023-01-01T00:00:00Z',
      },
      memberships: [
        {
          resourceType: 'project',
          resourceId: 'project1',
          roleNames: ['viewer'],
        },
      ],
    },
    {
      sanityUserId: 'user2',
      profile: {
        id: 'profile2',
        displayName: 'User 2',
        email: 'user2@example.com',
        provider: 'google',
        createdAt: '2023-01-02T00:00:00Z',
      },
      memberships: [
        {
          resourceType: 'project',
          resourceId: 'project1',
          roleNames: ['editor'],
        },
      ],
    },
  ]

  const mockResponse: SanityUserResponse = {
    data: mockUsers,
    totalCount: 2,
    nextCursor: null,
  }

  beforeEach(() => {
    request = vi.fn().mockReturnValue(of(mockResponse).pipe(delay(0)))

    vi.mocked(getClientState).mockReturnValue({
      observable: of({
        observable: {
          request,
        },
      } as SanityClient),
    } as StateSource<SanityClient>)
  })

  it('initializes users state and cleans up after unsubscribe', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const state = getUsersState(instance, {
      resourceType: 'project',
      projectId: 'project1',
    })

    // Initially undefined before subscription
    expect(state.getCurrent()).toBeUndefined()

    // Subscribe to start fetching
    const unsubscribe = state.subscribe()

    // Wait for data to be fetched
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Verify data is present
    expect(state.getCurrent()).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: false,
    })

    // Unsubscribe to trigger cleanup
    unsubscribe()

    // Wait for the cleanup delay
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Verify state is cleared
    expect(state.getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('maintains state when multiple subscribers exist', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const state = getUsersState(instance, {
      resourceType: 'project',
      projectId: 'project1',
    })

    // Add two subscribers
    const unsubscribe1 = state.subscribe()
    const unsubscribe2 = state.subscribe()

    // Wait for data to be fetched
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Verify data is present
    expect(state.getCurrent()).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: false,
    })

    // Remove first subscriber
    unsubscribe1()

    // Data should still be present due to second subscriber
    expect(state.getCurrent()).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: false,
    })

    // Remove second subscriber
    unsubscribe2()

    // Wait for cleanup delay
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Verify state is cleared after all subscribers are gone
    expect(state.getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('resolveUsers works without affecting subscriber cleanup', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const options: GetUsersOptions = {resourceType: 'project', projectId: 'project1'}

    const state = getUsersState(instance, options)

    // Check that getUsersState starts undefined
    expect(state.getCurrent()).toBeUndefined()

    // Use resolveUsers which should not add a subscriber
    const result = await resolveUsers(instance, options)
    expect(result).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: false,
    })

    // Check that getUsersState starts resolved now
    expect(state.getCurrent()).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: false,
    })

    // Subscribing and unsubscribing should clear the state
    const unsubscribe = state.subscribe()
    unsubscribe()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('handles abort signal in resolveUsers', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const options: GetUsersOptions = {resourceType: 'project', projectId: 'project1'}
    const abortController = new AbortController()

    // Create a promise that will reject when aborted
    const usersPromise = resolveUsers(instance, {
      ...options,
      signal: abortController.signal,
    })

    // Abort the request
    abortController.abort()

    // Verify the promise rejects with AbortError
    await expect(usersPromise).rejects.toThrow('The operation was aborted.')

    // Verify state is cleared after abort
    expect(getUsersState(instance, options).getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('loads more users when loadMoreUsers is called', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const options: GetUsersOptions = {resourceType: 'project', projectId: 'project1'}

    // First response has nextCursor
    const firstResponse = {
      ...mockResponse,
      nextCursor: 'next-page',
    }

    // Additional users for the second page
    const additionalUsers: SanityUser[] = [
      {
        sanityUserId: 'user3',
        profile: {
          id: 'profile3',
          displayName: 'User 3',
          email: 'user3@example.com',
          provider: 'google',
          createdAt: '2023-01-03T00:00:00Z',
        },
        memberships: [
          {
            resourceType: 'project',
            resourceId: 'project1',
            roleNames: ['admin'],
          },
        ],
      },
    ]

    // Second response has no nextCursor
    const secondResponse = {
      data: additionalUsers,
      totalCount: 3,
      nextCursor: null,
    }

    // Setup request mock to return different responses
    vi.mocked(request).mockReset()
    vi.mocked(request).mockImplementationOnce(() => of(firstResponse).pipe(delay(0)))
    vi.mocked(request).mockImplementationOnce(() => of(secondResponse).pipe(delay(0)))

    const state = getUsersState(instance, options)
    const unsubscribe = state.subscribe()

    // Wait for initial data
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Verify initial data
    expect(state.getCurrent()).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: true,
    })

    // Load more users
    await loadMoreUsers(instance, options)

    // Verify updated data includes both pages
    expect(state.getCurrent()).toEqual({
      data: [...mockUsers, ...additionalUsers],
      totalCount: 3,
      hasMore: false,
    })

    unsubscribe()
    instance.dispose()
  })

  it('throws error when loadMoreUsers is called without initial data', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    // Expect loadMoreUsers to throw when no data is loaded
    await expect(
      loadMoreUsers(instance, {resourceType: 'project', projectId: 'project1'}),
    ).rejects.toThrow('Users not loaded for specified resource')

    instance.dispose()
  })

  it('throws error when loadMoreUsers is called with no more data available', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const options: GetUsersOptions = {resourceType: 'project', projectId: 'project1'}

    // Response with no nextCursor
    vi.mocked(request).mockReset()
    vi.mocked(request).mockImplementationOnce(() => of(mockResponse).pipe(delay(0)))

    const state = getUsersState(instance, options)
    const unsubscribe = state.subscribe()

    // Wait for data to be fetched
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Expect loadMoreUsers to throw when hasMore is false
    await expect(loadMoreUsers(instance, options)).rejects.toThrow(
      'No more users available to load for this resource',
    )

    unsubscribe()
    instance.dispose()
  })

  it('handles errors in users fetching', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const errorMessage = 'Failed to fetch users'

    // Override request to simulate error
    vi.mocked(request).mockReset()
    vi.mocked(request).mockImplementationOnce(
      () =>
        new Observable((observer) => {
          observer.error(new Error(errorMessage))
        }),
    )

    const state = getUsersState(instance, {
      resourceType: 'project',
      projectId: 'project1',
    })
    const unsubscribe = state.subscribe()

    // Verify error is thrown when accessing state
    expect(() => state.getCurrent()).toThrow(errorMessage)

    unsubscribe()
    instance.dispose()
  })

  it('delays users state removal after unsubscribe', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const options: GetUsersOptions = {resourceType: 'project', projectId: 'project1'}
    const state = getUsersState(instance, options)
    const unsubscribe = state.subscribe()

    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    unsubscribe()
    // Immediately after unsubscription, state should still be present due to delay
    expect(state.getCurrent()).not.toBeUndefined()

    // Wait for the cleanup delay and then state should be removed
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('preserves users state if a new subscriber subscribes before cleanup delay', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const state = getUsersState(instance, {
      resourceType: 'project',
      projectId: 'project1',
    })
    const unsubscribe1 = state.subscribe()

    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))
    expect(state.getCurrent()).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: false,
    })

    unsubscribe1()
    // Wait less than the cleanup delay
    await new Promise((resolve) => setTimeout(resolve, 5))

    // Subscribe again before cleanup occurs
    const unsubscribe2 = state.subscribe()

    // Wait for cleanup delay to pass
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Since a subscriber now exists, state should still be present
    expect(state.getCurrent()).toEqual({
      data: mockUsers,
      totalCount: 2,
      hasMore: false,
    })

    unsubscribe2()
    instance.dispose()
  })
})
