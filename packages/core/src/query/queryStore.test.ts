import {CorsOriginError, type ListenEvent, type SanityClient} from '@sanity/client'
import {BehaviorSubject, delay, filter, firstValueFrom, Observable, of, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {isCanvasResource} from '../config/sanityConfig'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getQueryState, resolveQuery} from './queryStore'
import {QUERY_STATE_CLEAR_DELAY} from './queryStoreConstants'

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

// With fake timers, an emission gated on a pending rxjs delay or cleanup
// timeout never arrives on its own: create the promise first, advance the
// clock, then await it.
async function advanceAndAwait<T>(promise: Promise<T>, ms = 0): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

describe('queryStore', () => {
  let instance: SanityInstance
  let listenerEvents: Subject<ListenEvent>
  let fetch: SanityClient['observable']['fetch']
  let listen: SanityClient['listen']
  let liveEvents: Mock<SanityClient['live']['events']>
  let stopListening: Mock<() => void>
  // Mock data for testing
  const mockData = {
    movies: [
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ],
  }

  beforeEach(() => {
    vi.useFakeTimers()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    fetch = vi
      .fn()
      .mockReturnValue(
        of({result: mockData.movies, syncTags: []}).pipe(delay(0)),
      ) as SanityClient['observable']['fetch']

    listenerEvents = new Subject<ListenEvent>()
    stopListening = vi.fn()
    listen = vi.fn().mockReturnValue(
      new Observable((observer) => {
        const subscription = listenerEvents.subscribe(observer)
        return () => {
          subscription.unsubscribe()
          stopListening()
        }
      }),
    )
    liveEvents = vi.fn()

    const config = vi.fn().mockReturnValue({token: 'token'}) as SanityClient['config']

    vi.mocked(getClientState).mockReturnValue({
      observable: of({
        config,
        live: {events: liveEvents},
        listen,
        observable: {fetch},
      } as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  afterEach(() => {
    vi.mocked(getClientState).mockClear()
    instance.dispose()
    vi.useRealTimers()
  })

  it('initializes query state and cleans up after unsubscribe', async () => {
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})

    // Initially undefined before subscription
    expect(state.getCurrent()).toBeUndefined()

    // Subscribe to start fetching
    const unsubscribe = state.subscribe()

    // Wait for data to be fetched
    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))

    // Verify data is present
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    // Unsubscribe to trigger cleanup
    unsubscribe()

    // Wait for the cleanup delay
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)

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
    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))

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
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)

    // Verify state is cleared after all subscribers are gone
    expect(state.getCurrent()).toBeUndefined()
  })

  it('resolveQuery works without affecting subscriber cleanup', async () => {
    const query = '*[_type == "movie"]'

    const state = getQueryState(instance, {query})

    // Check that getQueryState starts undefined
    expect(state.getCurrent()).toBeUndefined()

    // resolveQuery holds only a temporary subscriber (released after the
    // clear delay once the promise settles)
    const result = await advanceAndAwait(resolveQuery(instance, {query}))
    expect(result).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    // Check that getQueryState is resolved now. This behavior is important
    // for supporting suspense: the resolved state must remain readable while
    // React re-renders and attaches a lasting subscriber
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    // Subscribing and unsubscribing should nuke the state now
    const unsubscribe = state.subscribe()
    unsubscribe()
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)
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

    // The key must be removed immediately (not after the clear delay): a new
    // resolveQuery re-adds it, which only triggers a fresh fetch if the abort
    // actually released the previous temporary subscriber
    const callsBefore = vi.mocked(fetch).mock.calls.length
    await expect(advanceAndAwait(resolveQuery(instance, {query}))).resolves.toEqual(mockData.movies)
    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore + 1)
  })

  it('uses a broad listener and bypasses the CDN while preserving query options', async () => {
    const options = {
      query: '*[_type == $type]{title, "author": author->name}',
      params: {type: 'movie'},
      perspective: 'published' as const,
      useCdn: true,
      tag: 'custom.query',
    }
    await advanceAndAwait(resolveQuery(instance, options))

    expect(liveEvents).not.toHaveBeenCalled()
    expect(listen).toHaveBeenCalledWith(
      '*',
      {},
      {
        events: ['welcome', 'mutation', 'reconnect'],
        includeResult: false,
        includeMutations: false,
        includeAllVersions: true,
        visibility: 'query',
        tag: 'query.listen',
      },
    )
    expect(fetch).toHaveBeenCalledWith(options.query, options.params, {
      perspective: 'published',
      useCdn: false,
      tag: 'custom.query',
      filterResponse: false,
      returnQuery: false,
    })
  })

  it.each(['author1', 'drafts.movie1', 'versions.release1.movie1'])(
    'refetches queries when %s changes, including referenced documents and versions',
    async (documentId) => {
      const query = '*[_type == "movie"]{title, "author": author->name}'
      const state = getQueryState(instance, {query})
      const unsubscribe = state.subscribe()
      await vi.advanceTimersByTimeAsync(0)

      const updated = [{_id: 'movie1', title: 'Updated', author: 'New author'}]
      vi.mocked(fetch).mockReturnValueOnce(of({result: updated, ms: 0}).pipe(delay(0)))
      listenerEvents.next({type: 'mutation', documentId} as ListenEvent)
      await vi.advanceTimersByTimeAsync(51)

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(state.getCurrent()).toEqual(updated)
      expect(vi.mocked(fetch).mock.calls[1][2]).not.toHaveProperty('lastLiveEventId')
      unsubscribe()
    },
  )

  it.each(['welcome', 'reconnect'] as const)('refetches on %s', async (type) => {
    const unsubscribe = getQueryState(instance, {query: '*'}).subscribe()
    await vi.advanceTimersByTimeAsync(0)
    listenerEvents.next({type, listenerName: 'test'})
    await vi.advanceTimersByTimeAsync(51)
    expect(fetch).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('coalesces bursts of mutations into a single refetch', async () => {
    const unsubscribe = getQueryState(instance, {query: '*'}).subscribe()
    await vi.advanceTimersByTimeAsync(0)
    for (let i = 0; i < 10; i++) {
      listenerEvents.next({type: 'mutation'} as ListenEvent)
    }
    await vi.advanceTimersByTimeAsync(51)
    expect(fetch).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('shares the listener across queries and releases it after the last query is removed', async () => {
    const unsubscribe1 = getQueryState(instance, {query: '*[_type == "movie"]'}).subscribe()
    await vi.advanceTimersByTimeAsync(0)
    const unsubscribe2 = getQueryState(instance, {query: 'count(*)'}).subscribe()
    await vi.advanceTimersByTimeAsync(0)
    expect(listen).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)

    listenerEvents.next({type: 'mutation'} as ListenEvent)
    await vi.advanceTimersByTimeAsync(51)
    expect(fetch).toHaveBeenCalledTimes(4)

    unsubscribe1()
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)
    expect(stopListening).not.toHaveBeenCalled()
    unsubscribe2()
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)
    expect(stopListening).toHaveBeenCalledTimes(1)

    listenerEvents.next({type: 'mutation'} as ListenEvent)
    await vi.advanceTimersByTimeAsync(51)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('replaces the listener and refetches when the client changes', async () => {
    const clients = new BehaviorSubject({listen, observable: {fetch}} as SanityClient)
    vi.mocked(getClientState).mockReturnValue({
      observable: clients.asObservable(),
    } as StateSource<SanityClient>)
    const unsubscribe = getQueryState(instance, {query: '*'}).subscribe()
    await vi.advanceTimersByTimeAsync(0)

    const replacementListen = vi.fn().mockReturnValue(new Subject<ListenEvent>())
    clients.next({listen: replacementListen, observable: {fetch}} as unknown as SanityClient)
    await vi.advanceTimersByTimeAsync(0)
    expect(stopListening).toHaveBeenCalledTimes(1)
    expect(replacementListen).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('releases the listener when the instance is disposed', () => {
    getQueryState(instance, {query: '*'}).subscribe()
    instance.dispose()
    expect(stopListening).toHaveBeenCalledTimes(1)
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

  it('refetches when a query key is re-added after an error', async () => {
    // First fetch fails (e.g. transient network failure)
    vi.mocked(fetch).mockReturnValueOnce(
      new Observable((observer) => {
        observer.error(new Error('transient network failure'))
      }),
    )

    const query = '*[_type == "movie"]'
    const state1 = getQueryState(instance, {query})
    const unsub1 = state1.subscribe()
    expect(() => state1.getCurrent()).toThrow('transient network failure')
    unsub1()

    // Wait for the clear delay so the key is fully removed from state
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)

    // Retry with the same key — must trigger a fresh fetch
    const state2 = getQueryState(instance, {query})
    const unsub2 = state2.subscribe()

    await vi.advanceTimersByTimeAsync(0)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)

    const result = await advanceAndAwait(
      firstValueFrom(state2.observable.pipe(filter((i) => i !== undefined))),
    )
    expect(result).toEqual(mockData.movies)
    unsub2()
  })

  it('releases an errored key created by resolveQuery so a retry can refetch', async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      new Observable((observer) => {
        observer.error(new Error('network down'))
      }),
    )

    const query = '*[_type == "movie"]'
    // This is how React drives a suspended query: resolveQuery creates the
    // key without any subscriber (the component never commits when it throws)
    await expect(resolveQuery(instance, {query})).rejects.toThrow('network down')

    // While the errored key exists, the error surfaces to error boundaries
    const state = getQueryState(instance, {query})
    expect(() => state.getCurrent()).toThrow('network down')

    // After the clear delay, the errored key must be released — otherwise it
    // has no subscribers, nothing ever removes it, and every future mount
    // rethrows the stored error without ever fetching
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)
    expect(state.getCurrent()).toBeUndefined()

    // A retry now creates a fresh key and fetches
    await expect(advanceAndAwait(resolveQuery(instance, {query}))).resolves.toEqual(mockData.movies)
  })

  it.each([new CorsOriginError({projectId: 'test'}), new Error('Unauthorized')])(
    'surfaces terminal listener errors: %s',
    async (error) => {
      const state = getQueryState(instance, {query: '*'})
      const unsubscribe = state.subscribe()
      await vi.advanceTimersByTimeAsync(0)
      listenerEvents.error(error)
      await vi.advanceTimersByTimeAsync(5000)
      expect(() => state.getCurrent()).toThrow(error)
      expect(listen).toHaveBeenCalledTimes(1)
      unsubscribe()
    },
  )

  it('delays query state removal after unsubscribe', async () => {
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})
    const unsubscribe = state.subscribe()

    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))

    unsubscribe()
    // Immediately after unsubscription, state should still be present due to delay
    expect(state.getCurrent()).not.toBeUndefined()

    // Wait for the cleanup delay and then state should be removed
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)
    expect(state.getCurrent()).toBeUndefined()
  })

  it('preserves query state if a new subscriber subscribes before cleanup delay', async () => {
    const query = '*[_type == "movie"]'
    const state = getQueryState(instance, {query})
    const unsubscribe1 = state.subscribe()

    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))
    expect(state.getCurrent()).toEqual([
      {_id: 'movie1', _type: 'movie', title: 'Movie 1'},
      {_id: 'movie2', _type: 'movie', title: 'Movie 2'},
    ])

    unsubscribe1()
    // Wait less than the cleanup delay
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY / 2)

    // Subscribe again before cleanup occurs
    const unsubscribe2 = state.subscribe()

    // Wait for cleanup delay to pass
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)

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
      projectId: 'test',
      dataset: 'test',
      perspective: 'drafts',
    })
    const publishedInstance = createSanityInstance({
      projectId: 'test',
      dataset: 'test',
      perspective: 'published',
    })

    // Same query/options, different implicit perspectives via instance.config
    const sDrafts = getQueryState<{_id: string}[]>(draftsInstance, {query: '*[_type == "movie"]'})
    const sPublished = getQueryState<{_id: string}[]>(publishedInstance, {
      query: '*[_type == "movie"]',
    })

    const unsubDrafts = sDrafts.subscribe()
    const unsubPublished = sPublished.subscribe()

    const draftsResult = await advanceAndAwait(
      firstValueFrom(sDrafts.observable.pipe(filter((i) => i !== undefined))),
    )
    const publishedResult = await advanceAndAwait(
      firstValueFrom(sPublished.observable.pipe(filter((i) => i !== undefined))),
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

    const base = createSanityInstance({projectId: 'test', dataset: 'test'})

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

    const draftsResult = await advanceAndAwait(
      firstValueFrom(sDrafts.observable.pipe(filter((i) => i !== undefined))),
    )
    const publishedResult = await advanceAndAwait(
      firstValueFrom(sPublished.observable.pipe(filter((i) => i !== undefined))),
    )

    expect(draftsResult).toEqual([{_id: 'drafts'}])
    expect(publishedResult).toEqual([{_id: 'pub'}])

    unsubDrafts()
    unsubPublished()

    base.dispose()
  })

  it('uses resource from params when passed in query options (listenForNewSubscribersAndFetch)', async () => {
    const query = '*[_type == "movie"]'
    const mediaLibrarySource = {mediaLibraryId: 'ml123'}

    const state = getQueryState(instance, {query, resource: mediaLibrarySource})
    const unsubscribe = state.subscribe()

    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))

    // Verify getClientState was called with the resource from params in listenForNewSubscribersAndFetch
    // This call includes projectId, dataset, and resource
    expect(getClientState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        resource: expect.objectContaining({
          mediaLibraryId: 'ml123',
        }),
      }),
    )

    unsubscribe()
  })

  it('scopes the shared listener to the resource from the store context', async () => {
    const query = '*[_type == "movie"]'
    const canvasSource = {canvasId: 'canvas456'}

    const state = getQueryState(instance, {query, resource: canvasSource})
    const unsubscribe = state.subscribe()

    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))

    // Verify getClientState was called with the canvas resource for the listener
    // The resource is extracted from the store key and passed when it's not a dataset resource
    // This call only has apiVersion and resource (no projectId/dataset)
    const calls = vi.mocked(getClientState).mock.calls
    const listenerClientCall = calls.find(
      ([_instance, options]) =>
        isCanvasResource(options.resource!) && options.resource.canvasId === 'canvas456',
    )
    expect(listenerClientCall).toBeDefined()

    unsubscribe()
  })
})
