import {type LiveEventMessage, type ReleaseDocument, type SanityClient} from '@sanity/client'
import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {observeLiveEvents} from '../client/liveEvents'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {observeReleases} from './observeReleases'

vi.mock('../client/clientStore', () => ({getClientState: vi.fn()}))
vi.mock('../client/liveEvents', () => ({observeLiveEvents: vi.fn()}))

describe('observeReleases', () => {
  let instance: SanityInstance
  let liveMessages: Subject<LiveEventMessage>
  let fetch: ReturnType<typeof vi.fn>

  const release = {
    _id: 'r1',
    _type: 'system.release',
    name: 'r1',
    metadata: {title: 'R1', releaseType: 'asap'},
  } as ReleaseDocument

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    liveMessages = new Subject<LiveEventMessage>()

    fetch = vi.fn().mockReturnValue(of({result: [release], syncTags: ['s1:tag']}))
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {fetch}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
    vi.mocked(observeLiveEvents).mockReturnValue(liveMessages.asObservable())
  })

  afterEach(() => {
    instance.dispose()
  })

  it('emits undefined synchronously, then fetches releases through the raw perspective', () => {
    const releases$ = observeReleases(instance, {onCorsError: vi.fn()})
    const emissions: (ReleaseDocument[] | undefined)[] = []
    const subscription = releases$.subscribe((releases) => emissions.push(releases))

    // the synchronous undefined lets the releases store immediately record an
    // empty list, so consumers (e.g. suspending React hooks) never hang on a
    // fetch that has not resolved yet
    expect(emissions).toEqual([undefined, [release]])
    expect(fetch).toHaveBeenCalledWith(
      'releases::all()',
      {},
      expect.objectContaining({
        perspective: 'raw',
        tag: 'releases',
        lastLiveEventId: undefined,
      }),
    )
    subscription.unsubscribe()
  })

  it('refetches with the live event id when a message matches the sync tags', () => {
    const releases$ = observeReleases(instance, {onCorsError: vi.fn()})
    const emissions: (ReleaseDocument[] | undefined)[] = []
    const subscription = releases$.subscribe((releases) => emissions.push(releases))

    liveMessages.next({type: 'message', id: 'event-1', tags: ['s1:tag']} as LiveEventMessage)

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(
      'releases::all()',
      {},
      expect.objectContaining({lastLiveEventId: 'event-1'}),
    )
    expect(emissions).toHaveLength(3) // initial undefined + two fetch results
    subscription.unsubscribe()
  })

  it('ignores live events that do not match the sync tags', () => {
    const releases$ = observeReleases(instance, {onCorsError: vi.fn()})
    const subscription = releases$.subscribe()

    liveMessages.next({type: 'message', id: 'event-1', tags: ['s1:other']} as LiveEventMessage)

    expect(fetch).toHaveBeenCalledTimes(1)
    subscription.unsubscribe()
  })

  it('refetches for a matching message that arrived while a fetch was still in flight', () => {
    const fetchResponses: Subject<{result: ReleaseDocument[]; syncTags: string[]}>[] = []
    fetch.mockImplementation(() => {
      const response$ = new Subject<{result: ReleaseDocument[]; syncTags: string[]}>()
      fetchResponses.push(response$)
      return response$
    })

    const releases$ = observeReleases(instance, {onCorsError: vi.fn()})
    const emissions: (ReleaseDocument[] | undefined)[] = []
    const subscription = releases$.subscribe((releases) => emissions.push(releases))

    expect(fetch).toHaveBeenCalledTimes(1)

    // A message lands while the initial fetch is in flight — its sync tags are
    // not known yet, so it can't be evaluated right away…
    liveMessages.next({type: 'message', id: 'event-1', tags: ['s1:tag']} as LiveEventMessage)
    expect(fetch).toHaveBeenCalledTimes(1)

    // …but once the fetch completes with matching tags, it must trigger a
    // refetch instead of being dropped (which would leave the store stale)
    fetchResponses[0].next({result: [release], syncTags: ['s1:tag']})
    fetchResponses[0].complete()

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith(
      'releases::all()',
      {},
      expect.objectContaining({lastLiveEventId: 'event-1'}),
    )

    fetchResponses[1].next({result: [release], syncTags: ['s1:tag']})
    fetchResponses[1].complete()
    expect(emissions).toHaveLength(3) // initial undefined + two fetch results

    subscription.unsubscribe()
  })
})
