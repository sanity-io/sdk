import {
  ClientError,
  ConnectionFailedError,
  type ListenEvent,
  type ReleaseDocument,
  type SanityClient,
} from '@sanity/client'
import {BehaviorSubject, of, Subject, Subscription, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {QUERY_CHANGE_INTERVAL} from '../client/observeQueryChanges'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {observeReleases} from './observeReleases'

vi.mock('../client/clientStore', () => ({getClientState: vi.fn()}))

describe('observeReleases', () => {
  let instance: SanityInstance
  let events: Subject<ListenEvent>
  let fetch: ReturnType<typeof vi.fn>
  let listen: ReturnType<typeof vi.fn>
  let clients: BehaviorSubject<SanityClient>
  let subscriptions: Subscription

  const release = {
    _id: '_.releases.r1',
    _type: 'system.release',
    name: 'r1',
    state: 'active',
    metadata: {title: 'R1', releaseType: 'asap'},
  } as ReleaseDocument

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    events = new Subject<ListenEvent>()
    subscriptions = new Subscription()
    fetch = vi.fn().mockReturnValue(of({result: [release]}))
    listen = vi.fn().mockReturnValue(events)
    clients = new BehaviorSubject({observable: {fetch, listen}} as unknown as SanityClient)
    vi.mocked(getClientState).mockReturnValue({
      observable: clients,
      getCurrent: () => clients.value,
      subscribe: () => () => {},
    })
  })

  afterEach(() => {
    subscriptions.unsubscribe()
    instance.dispose()
    vi.useRealTimers()
  })

  function observe(onError = vi.fn(), onFetchError = vi.fn()) {
    const emissions: (ReleaseDocument[] | undefined)[] = []
    subscriptions.add(
      observeReleases(instance, {onError, onFetchError}).subscribe((value) =>
        emissions.push(value),
      ),
    )
    return emissions
  }

  function clientError(statusCode: number) {
    return new ClientError({statusCode, headers: {}, body: {error: 'Error', message: 'failed'}})
  }

  function mutate() {
    events.next({type: 'mutation', documentId: release._id, visibility: 'query'} as ListenEvent)
  }

  const settle = () => vi.advanceTimersByTimeAsync(QUERY_CHANGE_INTERVAL + 10)

  it('fetches uncached release metadata and listens only for release documents', async () => {
    const emissions = observe()
    await settle()
    expect(emissions).toEqual([[release]])
    expect(fetch).toHaveBeenCalledWith(
      'releases::all()',
      {},
      {
        perspective: 'raw',
        useCdn: false,
        filterResponse: false,
        returnQuery: false,
        tag: 'releases',
      },
    )
    expect(listen).toHaveBeenCalledWith(
      '*[_type == "system.release" && _id in path("_.releases.*")]',
      {},
      expect.objectContaining({includeResult: false, visibility: 'query', tag: 'releases.listen'}),
    )
  })

  it('refreshes archived and published metadata as well as active releases', async () => {
    const emissions = observe()
    await settle()
    const archived = {...release, state: 'archived'}
    fetch.mockReturnValueOnce(of({result: [archived]}))
    mutate()
    await settle()
    expect(emissions).toEqual([[release], [archived]])
  })

  it('does not lose metadata changes that arrive during an in-flight fetch', async () => {
    const pending = new Subject<{result: ReleaseDocument[]}>()
    fetch.mockReturnValueOnce(pending)
    const changed = {...release, metadata: {...release.metadata, title: 'Updated'}}
    fetch.mockReturnValue(of({result: [changed]}))
    const emissions = observe()
    await settle()
    mutate()
    await settle()
    mutate()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    pending.next({result: [release]})
    pending.complete()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(emissions).toEqual([[release], [changed]])
  })

  it('keeps listening after a failed fetch and recovers on the next event', async () => {
    const error = clientError(403)
    const onFetchError = vi.fn()
    fetch.mockReturnValueOnce(throwError(() => error))
    const emissions = observe(vi.fn(), onFetchError)
    await settle()
    expect(onFetchError).toHaveBeenCalledWith(error)
    mutate()
    await settle()
    expect(emissions).toEqual([[release]])
  })

  it('retains loaded releases after a failed refresh and recovers on the next event', async () => {
    const onFetchError = vi.fn()
    const emissions = observe(vi.fn(), onFetchError)
    await settle()
    fetch.mockReturnValueOnce(throwError(() => clientError(403)))
    mutate()
    await settle()
    expect(onFetchError).not.toHaveBeenCalled()
    expect(emissions).toEqual([[release]])
    const updated = {...release, metadata: {...release.metadata, title: 'Updated'}}
    fetch.mockReturnValueOnce(of({result: [updated]}))
    mutate()
    await settle()
    expect(emissions).toEqual([[release], [updated]])
  })

  it('does not reuse release results when a new client cannot fetch them', async () => {
    const onFetchError = vi.fn()
    observe(vi.fn(), onFetchError)
    await settle()
    const failure = clientError(403)
    fetch.mockReturnValueOnce(throwError(() => failure))
    clients.next({...clients.value} as SanityClient)
    await settle()
    expect(onFetchError).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('refreshes after welcome rather than while reconnecting', async () => {
    observe()
    await settle()
    events.next({type: 'reconnect'} as ListenEvent)
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
    events.next({type: 'welcome'} as ListenEvent)
    await settle()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('cancels requests and replaces the listener when the client changes', async () => {
    const pending = new Subject<{result: ReleaseDocument[]}>()
    fetch.mockReturnValueOnce(pending)
    const emissions = observe()
    await settle()
    const nextEvents = new Subject<ListenEvent>()
    const changed = {...release, state: 'published'}
    clients.next({
      observable: {fetch: () => of({result: [changed]}), listen: () => nextEvents},
    } as unknown as SanityClient)
    await settle()
    expect(pending.observed).toBe(false)
    expect(events.observed).toBe(false)
    expect(nextEvents.observed).toBe(true)
    expect(emissions).toEqual([[changed]])
  })

  it('surfaces a terminal listener error and can recover after a client change', async () => {
    const onError = vi.fn()
    observe(onError)
    await settle()
    const error = new Error('forbidden')
    events.error(error)
    expect(onError).toHaveBeenCalledWith(error)
    const nextEvents = new Subject<ListenEvent>()
    clients.next({observable: {fetch, listen: () => nextEvents}} as unknown as SanityClient)
    await settle()
    expect(nextEvents.observed).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('finishes an in-flight fetch when the listener fails', async () => {
    const pending = new Subject<{result: ReleaseDocument[]}>()
    fetch.mockReturnValueOnce(pending)
    const onError = vi.fn()
    const emissions = observe(onError)
    await settle()
    expect(pending.observed).toBe(true)
    const error = new Error('listener unavailable')
    events.error(error)
    expect(onError).toHaveBeenCalledExactlyOnceWith(error)
    expect(pending.observed).toBe(true)
    pending.next({result: [release]})
    pending.complete()
    await settle()
    expect(emissions).toEqual([[release]])
  })

  it('retains releases through listener token expiration and refreshes with the next client', async () => {
    const onError = vi.fn()
    const emissions = observe(onError)
    await settle()
    events.error(new ConnectionFailedError('expired token', {status: 401}))
    await vi.advanceTimersByTimeAsync(5000)
    expect(emissions).toEqual([[release]])
    expect(onError).not.toHaveBeenCalled()
    expect(listen).toHaveBeenCalledTimes(1)
    const updated = {...release, metadata: {...release.metadata, title: 'Updated'}}
    const nextEvents = new Subject<ListenEvent>()
    clients.next({
      observable: {fetch: () => of({result: [updated]}), listen: () => nextEvents},
    } as unknown as SanityClient)
    await settle()
    expect(nextEvents.observed).toBe(true)
    expect(emissions).toEqual([[release], [updated]])
  })

  it('backs off and retries a transient fetch failure without reporting it', async () => {
    const onFetchError = vi.fn()
    fetch.mockReturnValueOnce(throwError(() => clientError(503)))
    const emissions = observe(vi.fn(), onFetchError)
    await settle()
    expect(emissions).toEqual([])
    await vi.advanceTimersByTimeAsync(500)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(emissions).toEqual([[release]])
    expect(onFetchError).not.toHaveBeenCalled()
  })

  it('refetches releases that failed with a 401 once the token changes', async () => {
    const unauthorized = clientError(401)
    const onFetchError = vi.fn()
    fetch.mockReturnValueOnce(throwError(() => unauthorized))
    const emissions = observe(vi.fn(), onFetchError)
    await settle()
    expect(onFetchError).toHaveBeenLastCalledWith(unauthorized)
    clients.next({observable: {fetch, listen: () => new Subject()}} as unknown as SanityClient)
    await settle()
    expect(emissions).toEqual([[release]])
    expect(onFetchError).toHaveBeenCalledOnce()
  })

  it('cancels a trailing fetch on unsubscribe', async () => {
    const pending = new Subject<{result: ReleaseDocument[]}>()
    fetch.mockReturnValueOnce(pending)
    observe()
    await settle()
    mutate()
    await settle()
    subscriptions.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(events.observed).toBe(false)
    pending.complete()
    await settle()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
