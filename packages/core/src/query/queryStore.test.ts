import {
  ConnectionFailedError,
  type ListenEvent,
  type RawQuerylessQueryResponse,
  type SanityClient,
} from '@sanity/client'
import {
  BehaviorSubject,
  delay,
  filter,
  firstValueFrom,
  Observable,
  of,
  Subject,
  throwError,
} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {QUERY_CHANGE_INTERVAL, QUERY_INDEXING_DELAY} from '../client/observeQueryChanges'
import {isCanvasResource} from '../config/sanityConfig'
import {getPerspectiveState} from '../releases/getPerspectiveState'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {UPSTREAM_CLOSE_DELAY_MS} from '../store/createStoreInstance'
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
async function advanceAndAwait<T>(promise: Promise<T>, ms = 10): Promise<T> {
  await vi.advanceTimersByTimeAsync(ms)
  return promise
}

describe('queryStore', () => {
  let instance: SanityInstance
  let listenerEvents: Subject<ListenEvent>
  let clients: BehaviorSubject<SanityClient>
  let client: SanityClient
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
    vi.useFakeTimers()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})

    fetch = vi
      .fn()
      .mockReturnValue(
        of({result: mockData.movies, syncTags: []}).pipe(delay(0)),
      ) as SanityClient['observable']['fetch']

    listenerEvents = new Subject<ListenEvent>()
    listen = vi.fn().mockReturnValue(listenerEvents)

    const events = vi.fn(() => {
      throw new Error('LCAPI must not be used')
    })

    const config = vi.fn().mockReturnValue({token: 'token'}) as SanityClient['config']

    client = {config, live: {events}, observable: {fetch, listen}} as unknown as SanityClient
    clients = new BehaviorSubject(client)
    vi.mocked(getClientState).mockReturnValue({
      observable: clients,
      getCurrent: () => clients.value,
      subscribe: () => () => {},
    })
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
    await vi.advanceTimersByTimeAsync(10)
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
    await vi.advanceTimersByTimeAsync(10)
    expect(() => state1.getCurrent()).toThrow('transient network failure')
    unsub1()

    // Wait for the clear delay so the key is fully removed from state
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)

    // Retry with the same key — must trigger a fresh fetch
    const state2 = getQueryState(instance, {query})
    const unsub2 = state2.subscribe()

    await vi.advanceTimersByTimeAsync(10)
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
    await expect(advanceAndAwait(resolveQuery(instance, {query}))).rejects.toThrow('network down')

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

  const mutate = (documentId = 'movie1', visibility = 'query') =>
    listenerEvents.next({type: 'mutation', documentId, visibility} as ListenEvent)
  const settleChanges = () => vi.advanceTimersByTimeAsync(QUERY_CHANGE_INTERVAL + 10)

  it('shares one listener and refetches all queries, including references and versions', async () => {
    const list = getQueryState(instance, {query: '*[_type == "movie"]', useCdn: true})
    const joined = getQueryState(instance, {query: '*[_type == "movie"]{author->name}'})
    list.subscribe()
    joined.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    expect(listen).toHaveBeenCalledTimes(1)
    expect(listen).toHaveBeenCalledWith(
      '*',
      {},
      expect.objectContaining({
        includeMutations: false,
        includeResult: false,
        includeAllVersions: true,
        visibility: 'query',
        tag: 'query.listen',
      }),
    )
    expect(fetch).toHaveBeenCalledTimes(2)
    mutate('versions.release1.author1')
    await settleChanges()
    expect(fetch).toHaveBeenCalledTimes(4)
    for (const [, , options] of vi.mocked(fetch).mock.calls) {
      expect(options?.useCdn).toBe(false)
      expect(options).not.toHaveProperty('lastLiveEventId')
    }
  })

  it('coalesces bursts and continues refetching during sustained mutations', async () => {
    getQueryState(instance, {query: '*'}).subscribe()
    await vi.advanceTimersByTimeAsync(10)
    for (let interval = 0; interval < 3; interval++) {
      for (let event = 0; event < 10; event++) mutate()
      await settleChanges()
      expect(fetch).toHaveBeenCalledTimes(interval + 2)
    }
  })

  it('finishes an in-flight fetch and performs one trailing refetch', async () => {
    const pending = new Subject<RawQuerylessQueryResponse<string>>()
    vi.mocked(fetch).mockReturnValueOnce(pending)
    vi.mocked(fetch).mockReturnValue(of({result: 'fresh', ms: 0}))
    const state = getQueryState(instance, {query: '*'})
    state.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    mutate()
    await settleChanges()
    mutate()
    await settleChanges()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(pending.observed).toBe(true)
    pending.next({result: 'initial', ms: 0})
    pending.complete()
    await vi.advanceTimersByTimeAsync(10)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(state.getCurrent()).toBe('fresh')
  })

  it('retains an early mutation refresh even when a query-visible event follows it', async () => {
    getQueryState(instance, {query: '*'}).subscribe()
    await vi.advanceTimersByTimeAsync(10)
    mutate('a', 'transaction')
    mutate('b')
    await settleChanges()
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(QUERY_INDEXING_DELAY)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it.each(['welcome', 'reconnect'] as const)('refetches on %s', async (type) => {
    getQueryState(instance, {query: '*'}).subscribe()
    await vi.advanceTimersByTimeAsync(10)
    listenerEvents.next({type} as ListenEvent)
    await settleChanges()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps the current result after a failed refresh and recovers on the next mutation', async () => {
    const state = getQueryState(instance, {query: '*'})
    state.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    vi.mocked(fetch).mockReturnValueOnce(throwError(() => new Error('unavailable')))
    mutate()
    await settleChanges()
    expect(state.getCurrent()).toEqual(mockData.movies)
    vi.mocked(fetch).mockReturnValueOnce(of({result: 'recovered', ms: 0}))
    mutate()
    await settleChanges()
    expect(state.getCurrent()).toBe('recovered')
  })

  it('recovers an initial fetch error without removing the query', async () => {
    vi.mocked(fetch).mockReturnValueOnce(throwError(() => new Error('unavailable')))
    const state = getQueryState(instance, {query: '*'})
    state.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    expect(() => state.getCurrent()).toThrow('unavailable')
    mutate()
    await settleChanges()
    expect(state.getCurrent()).toEqual(mockData.movies)
  })

  it('cancels obsolete fetches and replaces the listener when credentials change', async () => {
    const pending = new Subject<RawQuerylessQueryResponse<string>>()
    vi.mocked(fetch).mockReturnValue(pending)
    const state = getQueryState(instance, {query: '*'})
    state.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    const replacementEvents = new Subject<ListenEvent>()
    const replacementFetch = vi.fn().mockReturnValue(of({result: 'new credentials', ms: 0}))
    clients.next({
      ...client,
      observable: {fetch: replacementFetch, listen: () => replacementEvents},
    } as unknown as SanityClient)
    await vi.advanceTimersByTimeAsync(10)
    expect(pending.observed).toBe(false)
    expect(listenerEvents.observed).toBe(false)
    expect(replacementEvents.observed).toBe(true)
    expect(state.getCurrent()).toBe('new credentials')
  })

  it('cancels an obsolete fetch when the release perspective changes', async () => {
    const perspectives = new BehaviorSubject(['release1', 'drafts'])
    vi.mocked(getPerspectiveState).mockReturnValueOnce({
      observable: perspectives,
      getCurrent: () => perspectives.value,
      subscribe: () => () => {},
    })
    const pending = new Subject<RawQuerylessQueryResponse<string>>()
    vi.mocked(fetch).mockReturnValueOnce(pending)
    vi.mocked(fetch).mockReturnValue(of({result: 'new perspective', ms: 0}))
    const state = getQueryState(instance, {query: '*', perspective: {releaseName: 'release1'}})
    state.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    perspectives.next(['release2', 'release1', 'drafts'])
    await vi.advanceTimersByTimeAsync(10)
    expect(pending.observed).toBe(false)
    expect(state.getCurrent()).toBe('new perspective')
    expect(fetch).toHaveBeenLastCalledWith(
      '*',
      undefined,
      expect.objectContaining({
        perspective: ['release2', 'release1', 'drafts'],
      }),
    )
  })

  it.each(['client', 'perspective'])(
    'surfaces a failed first fetch after a %s change',
    async (change) => {
      const perspectives = new BehaviorSubject(['release1', 'drafts'])
      vi.mocked(getPerspectiveState).mockReturnValueOnce({
        observable: perspectives,
        getCurrent: () => perspectives.value,
        subscribe: () => () => {},
      })
      const state = getQueryState(instance, {query: '*', perspective: {releaseName: 'release1'}})
      state.subscribe()
      await vi.advanceTimersByTimeAsync(10)
      expect(state.getCurrent()).toEqual(mockData.movies)
      const failure = Object.assign(new Error('forbidden'), {statusCode: 403})
      vi.mocked(fetch).mockReturnValueOnce(throwError(() => failure))
      if (change === 'client') {
        clients.next({...client} as SanityClient)
      } else {
        perspectives.next(['release2', 'release1', 'drafts'])
      }
      await vi.advanceTimersByTimeAsync(10)
      expect(() => state.getCurrent()).toThrow(failure)
      mutate()
      await settleChanges()
      expect(state.getCurrent()).toEqual(mockData.movies)
    },
  )

  it('surfaces terminal listener errors and reconnects with a replacement client', async () => {
    const state = getQueryState(instance, {query: '*'})
    state.subscribe()
    await vi.advanceTimersByTimeAsync(10)
    listenerEvents.error(new ConnectionFailedError('expired token', {status: 401}))
    expect(() => state.getCurrent()).toThrow('expired token')
    await vi.advanceTimersByTimeAsync(5000)
    expect(listen).toHaveBeenCalledTimes(1)
    const nextEvents = new Subject<ListenEvent>()
    clients.next({
      ...client,
      observable: {fetch, listen: () => nextEvents},
    } as unknown as SanityClient)
    state.subscribe()
    nextEvents.next({type: 'welcome'} as ListenEvent)
    await settleChanges()
    expect(state.getCurrent()).toEqual(mockData.movies)
  })

  it('cancels pending refreshes when a query is removed', async () => {
    const pending = new Subject<RawQuerylessQueryResponse<string>>()
    vi.mocked(fetch).mockReturnValue(pending)
    const unsubscribe = getQueryState(instance, {query: '*'}).subscribe()
    await vi.advanceTimersByTimeAsync(10)
    mutate()
    await settleChanges()
    unsubscribe()
    await vi.advanceTimersByTimeAsync(QUERY_STATE_CLEAR_DELAY)
    expect(pending.observed).toBe(false)
    pending.complete()
    await settleChanges()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

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

  it('closes the query listener after the last subscriber leaves and reopens it on resubscribe', async () => {
    const state = getQueryState(instance, {query: '*[_type == "movie"]'})
    const unsubscribe = state.subscribe()
    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))
    expect(listenerEvents.observed).toBe(true)

    unsubscribe()
    await vi.advanceTimersByTimeAsync(UPSTREAM_CLOSE_DELAY_MS - 1)
    expect(listenerEvents.observed).toBe(true)
    await vi.advanceTimersByTimeAsync(1)
    expect(listenerEvents.observed).toBe(false)

    const unsubscribeAgain = state.subscribe()
    expect(listenerEvents.observed).toBe(true)
    unsubscribeAgain()
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

  it('uses resource from store context key when not a dataset resource (listenForQueryChanges)', async () => {
    const query = '*[_type == "movie"]'
    const canvasSource = {canvasId: 'canvas456'}

    const state = getQueryState(instance, {query, resource: canvasSource})
    const unsubscribe = state.subscribe()

    await advanceAndAwait(firstValueFrom(state.observable.pipe(filter((i) => i !== undefined))))

    // Verify getClientState was called with the canvas resource for query changes
    // The resource is extracted from the store key and passed when it's not a dataset resource
    // This call only has apiVersion and resource (no projectId/dataset)
    const calls = vi.mocked(getClientState).mock.calls
    const liveClientCall = calls.find(
      ([_instance, options]) =>
        isCanvasResource(options.resource!) && options.resource.canvasId === 'canvas456',
    )
    expect(liveClientCall).toBeDefined()

    unsubscribe()
  })
})
