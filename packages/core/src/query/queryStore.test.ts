import {type LiveEvent, type SanityClient, type SyncTag} from '@sanity/client'
import {delay, filter, firstValueFrom, Observable, of, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {isCanvasSource} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getQueryState, resolveQuery} from './queryStore'

vi.mock('./queryStoreConstants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queryStoreConstants')>()),
  QUERY_STATE_CLEAR_DELAY: 10,
}))

vi.mock('../client/clientStore', () => ({
  getClientState: vi.fn(),
}))

// Avoid initializing releases store/perspectives in these tests to prevent
// side-effect queries (e.g. releases::all()) that would duplicate fetch calls
vi.mock('../releases/getPerspectiveState', async () => {
  const actual = await vi.importActual('../releases/getPerspectiveState')
  return {
    ...actual,
    getPerspectiveState: vi.fn(
      (_instance, options?: {perspective?: unknown}) =>
        ({
          subscribe: () => () => {},
          getCurrent: () => (options?.perspective ?? 'drafts') as unknown,
          observable: of((options?.perspective ?? 'drafts') as unknown),
        }) as unknown as StateSource<unknown>,
    ),
  }
})

describe('queryStore', () => {
  let instance: SanityInstance
  let liveEvents: Subject<LiveEvent>
  let fetch: SanityClient['observable']['fetch']
  let listen: SanityClient['observable']['listen']
  // Mock data for testing
  const mockData = {
    movies: [
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ],
  }

  beforeEach(() => {
    instance = createSanityInstance({defaultSource: {projectId: 'test', dataset: 'test'}})

    fetch = vi
      .fn()
      .mockReturnValue(
        of({result: mockData.movies, syncTags: []}).pipe(delay(0)),
      ) as SanityClient['observable']['fetch']

    listen = vi.fn().mockReturnValue(of(mockData.movies))

    liveEvents = new Subject<LiveEvent>()

    const events = vi.fn().mockReturnValue(liveEvents) as SanityClient['live']['events']

    const config = vi.fn().mockReturnValue({token: 'token'}) as SanityClient['config']

    vi.mocked(getClientState).mockReturnValue({
      observable: of({
        config,
        live: {events},
        observable: {fetch, listen},
      } as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    vi.mocked(getClientState).mockClear()
    instance.dispose()
  })

  it('initializes query state and cleans up after unsubscribe', async () => {
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})

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
  })

  it('maintains state when multiple subscribers exist', async () => {
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})

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
  })

  it('resolveQuery works without affecting subscriber cleanup', async () => {
    const query = '*[_type == "movie"]'

    const state = getQueryState(instance, {query})

    // Check that getQueryState starts undefined
    expect(state.getCurrent()).toBeUndefined()

    // Use resolveQuery which should not add a subscriber
    const result = await resolveQuery(instance, {query})
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
  })

  it('handles abort signal in resolveQuery', async () => {
    const query = '*[_type == "movie"]'
    const abortController = new AbortController()

    // Create a promise that will reject when aborted
    const queryPromise = resolveQuery(instance, {query, signal: abortController.signal})

    // Abort the request
    abortController.abort()

    // Verify the promise rejects with AbortError
    await expect(queryPromise).rejects.toThrow('The operation was aborted.')

    // Verify state is cleared after abort
    expect(getQueryState(instance, {query}).getCurrent()).toBeUndefined()
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

    const query = '*[_type == "movie"]'
    const state = getQueryState<{_id: string; _type: string; title: string}[]>(instance, {query})

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
  })

  it('does not refetch for non-matching sync tags', async () => {
    const mockSyncTags: SyncTag[] = ['s1:movies']
    vi.mocked(fetch).mockReturnValueOnce(
      of({result: mockData.movies, syncTags: mockSyncTags, ms: 0}).pipe(delay(0)),
    )

    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})

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

    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})

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
  })

  it('handles errors in query fetching', async () => {
    const errorMessage = 'Query failed'

    // Override fetch to simulate error
    vi.mocked(fetch).mockReturnValueOnce(
      new Observable((observer) => {
        observer.error(new Error(errorMessage))
      }),
    )

    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})
    const unsubscribe = state.subscribe()

    // Verify error is thrown when accessing state
    expect(() => state.getCurrent()).toThrow(errorMessage)

    unsubscribe()
  })

  it('delays query state removal after unsubscribe', async () => {
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})
    const unsubscribe = state.subscribe()

    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    unsubscribe()
    // Immediately after unsubscription, state should still be present due to delay
    expect(state.getCurrent()).not.toBeUndefined()

    // Wait for the cleanup delay and then state should be removed
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(state.getCurrent()).toBeUndefined()
  })

  it('preserves query state if a new subscriber subscribes before cleanup delay', async () => {
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})
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
  })

  it('separates cache entries by implicit perspective (instance.config)', async () => {
    // Mock fetch to return different results based on perspective option
    vi.mocked(fetch).mockImplementation(((_q, _p, options) => {
      const perspective = (options as {perspective?: unknown})?.perspective
      const result = perspective === 'published' ? [{_id: 'pub'}] : [{_id: 'drafts'}]
      return of({result, syncTags: []}).pipe(delay(0)) as unknown as ReturnType<
        SanityClient['observable']['fetch']
      >
    }) as SanityClient['observable']['fetch'])

    const draftsInstance = createSanityInstance({
      defaultSource: {projectId: 'test', dataset: 'test'},
      perspective: 'drafts',
    })
    const publishedInstance = createSanityInstance({
      defaultSource: {projectId: 'test', dataset: 'test'},
      perspective: 'published',
    })

    // Same query/options, different implicit perspectives via instance.config
    const sDrafts = getQueryState<{_id: string}[]>(draftsInstance, {query: '*[_type == "movie"]'})
    const sPublished = getQueryState<{_id: string}[]>(publishedInstance, {
      query: '*[_type == "movie"]',
    })

    const unsubDrafts = sDrafts.subscribe()
    const unsubPublished = sPublished.subscribe()

    const draftsResult = await firstValueFrom(
      sDrafts.observable.pipe(filter((i) => i !== undefined)),
    )
    const publishedResult = await firstValueFrom(
      sPublished.observable.pipe(filter((i) => i !== undefined)),
    )

    expect(draftsResult).toEqual([{_id: 'drafts'}])
    expect(publishedResult).toEqual([{_id: 'pub'}])

    unsubDrafts()
    unsubPublished()

    draftsInstance.dispose()
    publishedInstance.dispose()
  })

  it('separates cache entries by explicit perspective in options', async () => {
    vi.mocked(fetch).mockImplementation(((_q, _p, options) => {
      const perspective = (options as {perspective?: unknown})?.perspective
      const result = perspective === 'published' ? [{_id: 'pub'}] : [{_id: 'drafts'}]
      return of({result, syncTags: []}).pipe(delay(0)) as unknown as ReturnType<
        SanityClient['observable']['fetch']
      >
    }) as SanityClient['observable']['fetch'])

    const base = createSanityInstance({defaultSource: {projectId: 'test', dataset: 'test'}})

    const sDrafts = getQueryState<{_id: string}[]>(base, {
      query: '*[_type == "movie"]',
      perspective: 'drafts',
    })
    const sPublished = getQueryState<{_id: string}[]>(base, {
      query: '*[_type == "movie"]',
      perspective: 'published',
    })

    const unsubDrafts = sDrafts.subscribe()
    const unsubPublished = sPublished.subscribe()

    const draftsResult = await firstValueFrom(
      sDrafts.observable.pipe(filter((i) => i !== undefined)),
    )
    const publishedResult = await firstValueFrom(
      sPublished.observable.pipe(filter((i) => i !== undefined)),
    )

    expect(draftsResult).toEqual([{_id: 'drafts'}])
    expect(publishedResult).toEqual([{_id: 'pub'}])

    unsubDrafts()
    unsubPublished()

    base.dispose()
  })

  it('uses source from params when passed in query options (listenForNewSubscribersAndFetch)', async () => {
    const query = '*[_type == "movie"]'
    const mediaLibrarySource = {mediaLibraryId: 'ml123'}

    const state = getQueryState(instance, {query, source: mediaLibrarySource})
    const unsubscribe = state.subscribe()

    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Verify getClientState was called with the source from params in listenForNewSubscribersAndFetch
    // This call includes projectId, dataset, and source
    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        source: expect.objectContaining({
          mediaLibraryId: 'ml123',
        }),
      }),
    )

    unsubscribe()
  })

  it('uses source from store context key when not a dataset source (listenToLiveClientAndSetLastLiveEventIds)', async () => {
    const query = '*[_type == "movie"]'
    const canvasSource = {canvasId: 'canvas456'}

    const state = getQueryState(instance, {query, source: canvasSource})
    const unsubscribe = state.subscribe()

    await firstValueFrom(state.observable.pipe(filter((i) => i !== undefined)))

    // Verify getClientState was called with the canvas source for live events
    // The source is extracted from the store key and passed when it's not a dataset source
    // This call only has apiVersion and source (no projectId/dataset)
    const calls = vi.mocked(getClientState).mock.calls
    const liveClientCall = calls.find(
      ([_instance, options]) =>
        isCanvasSource(options.source!) && options.source.canvasId === 'canvas456',
    )
    expect(liveClientCall).toBeDefined()

    unsubscribe()
  })

  it('uses bound source (not instance default) when a shared store receives a query without an explicit source', async () => {
    // Regression test: when a store for source B is first created by an
    // instance whose default source is A (passing source B explicitly),
    // subsequent queries added to that store without an explicit source
    // must still use source B for client creation — not fall back to the
    // captured instance's default source A.
    const projectASource = {projectId: 'project-a', dataset: 'production'}
    const projectBSource = {projectId: 'project-b', dataset: 'production'}

    const rootInstance = createSanityInstance({defaultSource: projectASource})

    // 1. Root instance queries with an explicit source for project B.
    //    This creates the QueryStore:project-b.production store, whose
    //    initialize() captures rootInstance in its closure.
    const stateWithSource = getQueryState(rootInstance, {
      query: '*[_type == "author"]',
      source: projectBSource,
    })
    const unsub1 = stateWithSource.subscribe()
    await firstValueFrom(stateWithSource.observable.pipe(filter((i) => i !== undefined)))

    vi.mocked(getClientState).mockClear()

    // 2. A child instance with project B as its default queries the SAME
    //    store (same composite key) but does NOT pass an explicit source.
    const childInstance = rootInstance.createChild({defaultSource: projectBSource})
    const stateNoSource = getQueryState(childInstance, {query: '*[_type == "movie"]'})
    const unsub2 = stateNoSource.subscribe()
    await firstValueFrom(stateNoSource.observable.pipe(filter((i) => i !== undefined)))

    // The listener should create a client using the bound source (project B),
    // not the captured rootInstance's default (project A).
    const fetchCalls = vi.mocked(getClientState).mock.calls
    const wrongCall = fetchCalls.find(
      ([, options]) =>
        options.projectId === 'project-a' ||
        (options.source &&
          'projectId' in options.source &&
          options.source.projectId === 'project-a'),
    )
    expect(wrongCall).toBeUndefined()

    const correctCall = fetchCalls.find(
      ([, options]) =>
        options.source && 'projectId' in options.source && options.source.projectId === 'project-b',
    )
    expect(correctCall).toBeDefined()

    unsub1()
    unsub2()
    childInstance.dispose()
    rootInstance.dispose()
  })
})
