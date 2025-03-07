import {type RawQuerylessQueryResponse, type SanityClient} from '@sanity/client'
import {pick} from 'lodash-es'
import {filter, firstValueFrom, map, ReplaySubject, Subject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {type StateSource} from '../resources/createStateSourceAction'
import {type DocumentListState} from './documentListStore'
import {
  type DocumentListQueryResult,
  subscribeToStateAndFetchResults,
} from './subscribeToStateAndFetchResults'

vi.mock('../client/clientStore.ts', () => ({
  getClientState: vi.fn().mockReturnValue({observable: new ReplaySubject(1)}),
}))

describe('subscribeToStateAndFetchResults', () => {
  const mockClientFetch = vi.fn()
  const mockClient = {
    observable: {
      fetch: mockClientFetch,
      config: vi.fn().mockReturnValue({}),
      live: {events: vi.fn()},
    },
  }
  const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  let state: ResourceState<DocumentListState>

  beforeEach(() => {
    // Make getClientState().observable return an observable that immediately emits fakeClient.
    const client$ = (getClientState as () => StateSource<SanityClient>)()
      .observable as ReplaySubject<SanityClient>
    client$.next(mockClient as unknown as SanityClient)

    state = createResourceState<DocumentListState>(
      {
        limit: 25,
        options: {perspective: 'drafts'},
        results: [],
        syncTags: [],
        isPending: false,
        count: 0,
      },
      {name: 'documentList'},
    )
    mockClientFetch.mockReset()
  })

  it('should update state with fetched data', async () => {
    const mockResults = [{_id: 'doc1', _type: 'testType'}]

    mockClientFetch.mockResolvedValue({
      ms: 0,
      result: {results: mockResults, count: 1},
      syncTags: ['s1:initial'],
    } satisfies RawQuerylessQueryResponse<DocumentListQueryResult>)

    const statePromise = firstValueFrom(state.observable.pipe(filter((s) => !!s.results.length)))
    const subscription = subscribeToStateAndFetchResults({state, instance})

    await expect(statePromise).resolves.toEqual({
      limit: 25,
      options: {perspective: 'drafts'},
      results: mockResults,
      count: 1,
      syncTags: ['s1:initial'],
      isPending: false,
      lastLiveEventId: undefined,
    })

    expect(mockClientFetch).toHaveBeenCalledWith(
      '{"count":count(*),"results":*[0...$__limit]{_id, _type}}',
      {__limit: 25},
      {
        filterResponse: false,
        lastLiveEventId: undefined,
        perspective: 'drafts',
        returnQuery: false,
        tag: 'sdk.document-list',
      },
    )

    subscription.unsubscribe()
  })

  it('should update state when options change', async () => {
    const mockResults = [{_id: 'doc1', _type: 'testType'}]
    mockClientFetch.mockResolvedValue({
      ms: 0,
      result: {results: mockResults, count: 1},
      syncTags: ['s1:initial'],
    } satisfies RawQuerylessQueryResponse<DocumentListQueryResult>)

    const statePromise = firstValueFrom(state.observable.pipe(filter((s) => !!s.results.length)))
    const subscription = subscribeToStateAndFetchResults({state, instance})

    state.set('setOptions', (prev) => ({options: {...prev.options, filter: '_type == "testType"'}}))

    await statePromise

    expect(mockClientFetch).toHaveBeenLastCalledWith(
      '{"count":count(*[_type == "testType"]),"results":*[_type == "testType"][0...$__limit]{_id, _type}}',
      {__limit: 25},
      {
        filterResponse: false,
        lastLiveEventId: undefined,
        perspective: 'drafts',
        returnQuery: false,
        tag: 'sdk.document-list',
      },
    )

    subscription.unsubscribe()
  })

  it('should debounce fetch calls', async () => {
    const mockResults = [{_id: 'doc1', _type: 'testType'}]
    mockClientFetch.mockResolvedValue({
      ms: 0,
      result: {results: mockResults, count: 1},
      syncTags: ['s1:initial'],
    } satisfies RawQuerylessQueryResponse<DocumentListQueryResult>)

    const statePromise = firstValueFrom(state.observable.pipe(filter((s) => !!s.results.length)))
    const subscription = subscribeToStateAndFetchResults({state, instance})

    state.set('setOptions', (prev) => ({options: {...prev.options, filter: '_type == "testType"'}}))
    state.set('setOptions', (prev) => ({
      options: {...prev.options, sort: [{field: '_createdAt', direction: 'asc'}]},
    }))
    state.set('setOptions', (prev) => ({options: {...prev.options, filter: '_id == "doc1"'}}))

    await statePromise

    expect(mockClientFetch).toHaveBeenCalledTimes(1)
    expect(mockClientFetch).toHaveBeenLastCalledWith(
      '{"count":count(*[_id == "doc1"]),"results":*[_id == "doc1"]| order(_createdAt asc)[0...$__limit]{_id, _type}}',
      {__limit: 25},
      {
        filterResponse: false,
        lastLiveEventId: undefined,
        perspective: 'drafts',
        returnQuery: false,
        tag: 'sdk.document-list',
      },
    )
    subscription.unsubscribe()
  })

  it('should set isPending to true during fetch', async () => {
    const fetchSubject = new Subject<RawQuerylessQueryResponse<DocumentListQueryResult>>()
    mockClientFetch.mockReturnValue(fetchSubject)

    const isPendingPromise = firstValueFrom(
      state.observable.pipe(
        filter((s) => s.isPending),
        map((s) => pick(s, 'isPending')),
      ),
    )

    const subscription = subscribeToStateAndFetchResults({state, instance})

    await expect(isPendingPromise).resolves.toEqual({isPending: true})

    fetchSubject.next({result: {results: [], count: 0}, syncTags: [], ms: 0})
    fetchSubject.complete()

    const isNotPendingPromise = firstValueFrom(
      state.observable.pipe(
        filter((s) => !s.isPending),
        map((s) => pick(s, 'isPending')),
      ),
    )

    await expect(isNotPendingPromise).resolves.toEqual({isPending: false})
    subscription.unsubscribe()
  })

  it('should include `lastLiveEventId` in the fetch options', async () => {
    const mockResults = [{_id: 'doc1', _type: 'testType'}]
    mockClientFetch.mockResolvedValue({
      ms: 0,
      result: {results: mockResults, count: 1},
      syncTags: ['s1:initial'],
    } satisfies RawQuerylessQueryResponse<DocumentListQueryResult>)
    state.set('updateEventIdFromLiveContentApi', {lastLiveEventId: 'live-event-id'})

    const statePromise = firstValueFrom(state.observable.pipe(filter((s) => !!s.results.length)))
    const subscription = subscribeToStateAndFetchResults({state, instance})

    await statePromise

    expect(mockClientFetch).toHaveBeenLastCalledWith(
      '{"count":count(*),"results":*[0...$__limit]{_id, _type}}',
      {__limit: 25},
      {
        filterResponse: false,
        lastLiveEventId: 'live-event-id',
        perspective: 'drafts',
        returnQuery: false,
        tag: 'sdk.document-list',
      },
    )

    subscription.unsubscribe()
  })
})
