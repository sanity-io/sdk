import {type LiveEvent, type SanityClient, type SyncTag} from '@sanity/client'
import {delay, filter, firstValueFrom, Observable, of, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance} from '../instance/sanityInstance'
import {getOrCreateResource} from '../resources/createResource'
import {type StateSource} from '../resources/createStateSourceAction'
import {errorHandler, getQueryState, queryStore, resolveQuery} from './queryStore'

vi.mock('./queryStoreConstants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queryStoreConstants')>()),
  QUERY_STATE_CLEAR_DELAY: 10,
}))

vi.mock('../client/clientStore', () => ({
  getClientState: vi.fn(),
}))

describe('queryStore', () => {
  let liveEvents: Subject<LiveEvent>
  let fetch: SanityClient['observable']['fetch']
  // Mock data for testing
  const mockData = {
    movies: [
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ],
  }

  beforeEach(() => {
    fetch = vi
      .fn()
      .mockReturnValue(
        of({result: mockData.movies, syncTags: []}).pipe(delay(0)),
      ) as SanityClient['observable']['fetch']

    liveEvents = new Subject<LiveEvent>()

    const events = vi.fn().mockReturnValue(liveEvents) as SanityClient['live']['events']

    const config = vi.fn().mockReturnValue({token: 'token'}) as SanityClient['config']

    vi.mocked(getClientState).mockReturnValue({
      observable: of({
        config,
        live: {events},
        observable: {fetch},
      } as SanityClient),
    } as StateSource<SanityClient>)
  })

  it('initializes query state and cleans up after unsubscribe', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)

    // Initially undefined before subscription
    expect(state.getCurrent()).toBeUndefined()

    // Subscribe to start fetching
    const unsubscribe = state.subscribe()

    // Wait for data to be fetched
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Verify data is present
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

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
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)

    // Add two subscribers
    const unsubscribe1 = state.subscribe()
    const unsubscribe2 = state.subscribe()

    // Wait for data to be fetched
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Verify data is present
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    // Remove first subscriber
    unsubscribe1()

    // Data should still be present due to second subscriber
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    // Remove second subscriber
    unsubscribe2()

    // Wait for cleanup delay
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Verify state is cleared after all subscribers are gone
    expect(state.getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('resolveQuery works without affecting subscriber cleanup', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'

    const state = getQueryState(instance, query)

    // Check that getQueryState starts undefined
    expect(state.getCurrent()).toBeUndefined()

    // Use resolveQuery which should not add a subscriber
    const result = await resolveQuery(instance, query)
    expect(result).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    // Check that getQueryState starts resolved now.
    // Note that this behavior is important for supporting suspense.
    // `resolveQuery` is the only way to resolve state without adding a
    // subscriber that can trigger a clean up
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    // Subscribing and unsubscribing should nuke the state now
    const unsubscribe = state.subscribe()
    unsubscribe()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('handles abort signal in resolveQuery', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const abortController = new AbortController()

    // Create a promise that will reject when aborted
    const queryPromise = resolveQuery(instance, query, {signal: abortController.signal})

    // Abort the request
    abortController.abort()

    // Verify the promise rejects with AbortError
    await expect(queryPromise).rejects.toThrow('The operation was aborted.')

    // Verify state is cleared after abort
    expect(getQueryState(instance, query).getCurrent()).toBeUndefined()

    instance.dispose()
  })

  it('refetches query when receiving live event with matching sync tag', async () => {
    const mockSyncTags: SyncTag[] = ['s1:movies']
    const updatedMovie = {_id: 'movie3', _type: 'movie', title: 'Movie 3'}

    // First fetch returns initial data with sync tags
    vi.mocked(fetch).mockReturnValueOnce(
      of({result: mockData.movies, syncTags: mockSyncTags, ms: 0}).pipe(delay(0)),
    )
    // Second fetch returns updated data
    vi.mocked(fetch).mockReturnValueOnce(
      of({result: [...mockData.movies, updatedMovie], syncTags: mockSyncTags, ms: 0}).pipe(
        delay(0),
      ),
    )

    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const state = getQueryState<{_id: string; _type: string; title: string}[]>(instance, query)

    const unsubscribe = state.subscribe()
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Emit live event with matching sync tag
    liveEvents.next({
      type: 'message',
      id: 'event1',
      tags: mockSyncTags,
      documentId: 'movie3',
      event: 'created',
    } as LiveEvent)

    // Wait for updated data
    const result = await firstValueFrom(state.observable.pipe(filter((data) => data?.length === 3)))

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetch).mock.calls[1][2]?.lastLiveEventId).toBe('event1')
    expect(result).toContainEqual(updatedMovie)

    unsubscribe()
    instance.dispose()
  })

  it('does not refetch for non-matching sync tags', async () => {
    const mockSyncTags: SyncTag[] = ['s1:movies']
    vi.mocked(fetch).mockReturnValueOnce(
      of({result: mockData.movies, syncTags: mockSyncTags, ms: 0}).pipe(delay(0)),
    )

    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)

    const unsubscribe = state.subscribe()
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Emit event with different tag
    liveEvents.next({
      type: 'message',
      id: 'event1',
      tags: ['s1:other'],
      documentId: 'movie3',
      event: 'created',
    } as LiveEvent)

    await new Promise((resolve) => setTimeout(resolve, 50)) // Allow time for potential refetch
    expect(fetch).toHaveBeenCalledTimes(1)

    unsubscribe()
    instance.dispose()
  })

  it('handles multiple live events with same sync tag', async () => {
    const mockSyncTags: SyncTag[] = ['s1:movies']
    vi.mocked(fetch).mockReturnValueOnce(
      of({result: mockData.movies, syncTags: mockSyncTags, ms: 0}).pipe(delay(0)),
    )
    vi.mocked(fetch).mockReturnValueOnce(
      of({result: mockData.movies, syncTags: mockSyncTags, ms: 0}).pipe(delay(0)),
    )
    vi.mocked(fetch).mockReturnValueOnce(
      of({result: mockData.movies, syncTags: mockSyncTags, ms: 0}).pipe(delay(0)),
    )

    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)

    const unsubscribe = state.subscribe()
    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Emit two events with same tag
    liveEvents.next({
      type: 'message',
      id: 'event1',
      tags: mockSyncTags,
    })

    liveEvents.next({
      type: 'message',
      id: 'event2',
      tags: mockSyncTags,
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(vi.mocked(fetch).mock.calls[1][2]?.lastLiveEventId).toBe('event1')
    expect(vi.mocked(fetch).mock.calls[2][2]?.lastLiveEventId).toBe('event2')

    unsubscribe()
    instance.dispose()
  })

  it('handles errors in query fetching', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const errorMessage = 'Query failed'

    // Override fetch to simulate error
    vi.mocked(fetch).mockReturnValueOnce(
      new Observable((observer) => {
        observer.error(new Error(errorMessage))
      }),
    )

    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)
    const unsubscribe = state.subscribe()

    // Verify error is thrown when accessing state
    expect(() => state.getCurrent()).toThrow(errorMessage)

    unsubscribe()
    instance.dispose()
  })

  it('throws an error if an errorHandler has been called', () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)

    const resource = getOrCreateResource(instance, queryStore)

    // Create an error and call the error handler
    const testError = new Error('Global error from error handler')
    const handler = errorHandler({state: resource.state, instance})
    handler(testError)

    // Verify the error is thrown when accessing state
    expect(() => state.getCurrent()).toThrow('Global error from error handler')

    instance.dispose()
  })

  it('delays query state removal after unsubscribe', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)
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

  it('preserves query state if a new subscriber subscribes before cleanup delay', async () => {
    const instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, query)
    const unsubscribe1 = state.subscribe()

    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    unsubscribe1()
    // Wait less than the cleanup delay
    await new Promise((resolve) => setTimeout(resolve, 5))

    // Subscribe again before cleanup occurs
    const unsubscribe2 = state.subscribe()

    // Wait for cleanup delay to pass
    await new Promise((resolve) => setTimeout(resolve, 20))

    // Since a subscriber now exists, state should still be present
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])
    unsubscribe2()
    instance.dispose()
  })
})
