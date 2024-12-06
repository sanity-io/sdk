import {bufferTime, firstValueFrom, Observable, of} from 'rxjs'
import {describe, it, type Mock, vi} from 'vitest'

import {getClient} from '../client/getClient'
import {
  createDocumentListStore,
  type DocumentListState,
  type DocumentListStore,
} from './documentListStore'

vi.mock('../client/store/clientStore', () => {
  const unsubscribe = vi.fn()
  const subscribe = vi.fn((observer) => {
    observer.next({
      id: 'mock-event-id',
      type: 'message',
      tags: [],
    })
    return {unsubscribe}
  })

  const mockClient = {
    observable: {
      fetch: vi.fn(() =>
        of({
          syncTags: [],
          result: [],
        }),
      ),
    },
    live: {
      events: vi.fn(() => {
        const observable = of({
          id: 'mock-event-id',
          type: 'message',
          tags: [],
        })
        // @ts-expect-error -- this is just to expose the mock
        observable.subscribe = subscribe
        return observable
      }),
    },
  }

  const mockStore = {
    subscribe: (callback: () => void) => {
      callback()
      return () => {}
    },
  }

  const mockGetClientEvents = () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subscribe: (subscriber: any) => {
      subscriber.next(mockClient)
      return {
        unsubscribe: vi.fn(),
      }
    },
  })

  return {
    getClientStore: () => ({
      store: mockStore,
      getClientEvents: mockGetClientEvents,
      getOrCreateClient: vi.fn(() => mockClient),
    }),
  }
})

describe('documentListStore', () => {
  let documentListStore!: DocumentListStore
  let client!: {
    observable: {fetch: Mock}
    live: {events: () => {subscribe: Mock}}
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error the types are wrong here since we're mocking
    client = getClient()

    // @ts-expect-error the types are wrong here since we're mocking
    documentListStore = createDocumentListStore()
  })

  function subscribeAndGetEmissions() {
    return firstValueFrom(
      new Observable<DocumentListState>((observer) => {
        const subscription = documentListStore.subscribe(observer)
        return () => subscription.unsubscribe()
      }).pipe(bufferTime(100)),
    )
  }

  function tick() {
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  it('fetches a result set based on the set options', async () => {
    client.observable.fetch.mockImplementation(() =>
      of({
        syncTags: [],
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
      }),
    )

    const emissionsPromise = subscribeAndGetEmissions()

    documentListStore.setOptions({
      filter: '_type == "author"',
    })

    const emissions = await emissionsPromise
    expect(emissions).toHaveLength(3)

    expect(emissions).toEqual([
      {
        filter: undefined,
        isPending: false,
        result: null,
        sort: undefined,
      },
      {
        filter: '_type == "author"',
        isPending: true,
        result: null,
        sort: undefined,
      },
      {
        filter: '_type == "author"',
        isPending: false,
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
        sort: undefined,
      },
    ])
  })

  it('re-fetches the result set when the live content API emits a matching sync tag', async () => {
    client.observable.fetch.mockImplementation(() =>
      of({
        syncTags: ['s1:example-sync-tag'],
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
      }),
    )

    expect(client.live.events().subscribe).toHaveBeenCalledTimes(1)
    const [[observer]] = client.live.events().subscribe.mock.calls

    documentListStore.setOptions({
      filter: '_type == "author"',
    })

    const emissionsPromise = subscribeAndGetEmissions()

    observer.next?.({id: 'event-id', tags: ['s1:example-sync-tag'], type: 'message'})
    await tick()

    const emissions = await emissionsPromise

    expect(emissions).toHaveLength(3)

    const result = [
      {_id: 'first-id', _type: 'author'},
      {_id: 'second-id', _type: 'author'},
    ]

    const filter = '_type == "author"'

    expect(emissions).toEqual([
      {isPending: false, result, filter},
      {isPending: true, result, filter},
      {isPending: false, result, filter},
    ])
  })

  it('does not re-fetch on non-matching sync tags', async () => {
    client.observable.fetch.mockImplementation(() =>
      of({
        syncTags: ['s1:example-sync-tag'],
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
      }),
    )

    expect(client.live.events().subscribe).toHaveBeenCalledTimes(1)
    const [[observer]] = client.live.events().subscribe.mock.calls

    documentListStore.setOptions({
      filter: '_type == "author"',
    })

    const emissionsPromise = subscribeAndGetEmissions()

    observer.next?.({id: 'event-id', tags: ['s1:no-match'], type: 'message'})
    await tick()

    const emissions = await emissionsPromise

    expect(emissions).toHaveLength(1)
    expect(emissions).toEqual([
      {
        isPending: false,
        filter: '_type == "author"',
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
      },
    ])
  })

  it('re-fetches the result set when options are changed', async () => {
    const result = [
      {_id: 'first-id', _type: 'author'},
      {_id: 'second-id', _type: 'author'},
    ]

    client.observable.fetch.mockImplementation(() =>
      of({
        syncTags: [],
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
      }),
    )

    const emissionsPromise = subscribeAndGetEmissions()

    documentListStore.setOptions({
      filter: '_type == "author"',
    })
    await tick()
    expect(documentListStore.getCurrent()).toEqual({
      filter: '_type == "author"',
      isPending: false,
      result,
    })

    documentListStore.setOptions({
      sort: [{direction: 'asc', field: 'name'}],
    })
    await tick()
    expect(documentListStore.getCurrent()).toEqual({
      filter: '_type == "author"',
      sort: [{direction: 'asc', field: 'name'}],
      isPending: false,
      result,
    })

    documentListStore.setOptions({
      filter: '_type == "book"',
    })
    await tick()
    expect(documentListStore.getCurrent()).toEqual({
      filter: '_type == "book"',
      sort: [{direction: 'asc', field: 'name'}],
      isPending: false,
      result,
    })

    documentListStore.setOptions({
      sort: [{direction: 'desc', field: 'name'}],
    })
    await tick()
    expect(documentListStore.getCurrent()).toEqual({
      filter: '_type == "book"',
      sort: [{direction: 'desc', field: 'name'}],
      isPending: false,
      result,
    })

    const emissions = await emissionsPromise
    expect(emissions).toHaveLength(9)

    expect(emissions).toMatchObject([
      {filter: undefined, isPending: false, result: null, sort: undefined},
      {filter: '_type == "author"', isPending: true, result: null, sort: undefined},
      {filter: '_type == "author"', isPending: false, result, sort: undefined},
      {
        filter: '_type == "author"',
        isPending: true,
        result,
        sort: [{direction: 'asc', field: 'name'}],
      },
      {
        filter: '_type == "author"',
        isPending: false,
        result,
        sort: [{direction: 'asc', field: 'name'}],
      },
      {
        filter: '_type == "book"',
        isPending: true,
        result,
        sort: [{direction: 'asc', field: 'name'}],
      },
      {
        filter: '_type == "book"',
        isPending: false,
        result,
        sort: [{direction: 'asc', field: 'name'}],
      },
      {
        filter: '_type == "book"',
        isPending: true,
        result,
        sort: [{direction: 'desc', field: 'name'}],
      },
      {
        filter: '_type == "book"',
        isPending: false,
        result,
        sort: [{direction: 'desc', field: 'name'}],
      },
    ])

    expect(client.observable.fetch).toHaveBeenCalledTimes(4)
    expect(client.observable.fetch.mock.calls).toEqual([
      [
        '*[_type == "author"][0..$__limit]{_id, _type}',
        {__limit: 50},
        {
          filterResponse: false,
          lastLiveEventId: undefined,
          returnQuery: false,
          tag: 'sdk.document-list',
        },
      ],
      [
        '*[_type == "author"]| order(name asc)[0..$__limit]{_id, _type}',
        {__limit: 50},
        {
          filterResponse: false,
          lastLiveEventId: undefined,
          returnQuery: false,
          tag: 'sdk.document-list',
        },
      ],
      [
        '*[_type == "book"]| order(name asc)[0..$__limit]{_id, _type}',
        {__limit: 50},
        {
          filterResponse: false,
          lastLiveEventId: undefined,
          returnQuery: false,
          tag: 'sdk.document-list',
        },
      ],
      [
        '*[_type == "book"]| order(name desc)[0..$__limit]{_id, _type}',
        {__limit: 50},
        {
          filterResponse: false,
          lastLiveEventId: undefined,
          returnQuery: false,
          tag: 'sdk.document-list',
        },
      ],
    ])
  })

  it('fetches more documents when load more is called', async () => {
    const firstResult = [
      {_id: 'first-id', _type: 'author'},
      {_id: 'second-id', _type: 'author'},
    ]
    const secondResult = [
      ...firstResult,
      {_id: 'third-id', _type: 'author'},
      {_id: 'fourth-id', _type: 'author'},
    ]
    client.observable.fetch.mockImplementationOnce(() =>
      of({
        syncTags: [],
        result: firstResult,
      }),
    )

    client.observable.fetch.mockImplementationOnce(() =>
      of({
        syncTags: [],
        result: secondResult,
      }),
    )

    documentListStore.setOptions({
      filter: '_type == "author"',
    })

    const emissionsPromise = subscribeAndGetEmissions()

    documentListStore.loadMore()
    await tick()

    const emissions = await emissionsPromise
    expect(emissions).toHaveLength(3)
    expect(emissions).toEqual([
      {isPending: false, result: firstResult, filter: '_type == "author"'},
      {isPending: true, result: firstResult, filter: '_type == "author"'},
      {isPending: false, result: secondResult, filter: '_type == "author"'},
    ])

    expect(client.observable.fetch).toHaveBeenCalledTimes(2)
    expect(client.observable.fetch.mock.calls).toEqual([
      [
        '*[_type == "author"][0..$__limit]{_id, _type}',
        {__limit: 50},
        {
          filterResponse: false,
          lastLiveEventId: undefined,
          returnQuery: false,
          tag: 'sdk.document-list',
        },
      ],
      [
        '*[_type == "author"][0..$__limit]{_id, _type}',
        {__limit: 100},
        {
          filterResponse: false,
          lastLiveEventId: undefined,
          returnQuery: false,
          tag: 'sdk.document-list',
        },
      ],
    ])
  })

  // it('unsubscribes from the live client when disposed', async () => {
  //   client.observable.fetch.mockImplementation(() =>
  //     of({
  //       syncTags: [],
  //       result: [
  //         {_id: 'first-id', _type: 'author'},
  //         {_id: 'second-id', _type: 'author'},
  //       ],
  //     }),
  //   )

  //   const {unsubscribe} = client.live.events().subscribe()

  //   expect(unsubscribe).not.toHaveBeenCalled()
  //   documentListStore.dispose()
  //   expect(unsubscribe).toHaveBeenCalled()
  // })

  it('preserves referential equality in the result set', async () => {
    client.observable.fetch.mockImplementationOnce(() =>
      of({
        syncTags: [],
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
      }),
    )

    client.observable.fetch.mockImplementationOnce(() =>
      of({
        syncTags: [],
        result: [{_id: 'first-id', _type: 'author'}],
      }),
    )

    const emissionsPromise = subscribeAndGetEmissions()

    documentListStore.setOptions({
      filter: '_type == "author"',
    })
    await tick()
    documentListStore.setOptions({
      filter: '_id == "first-id"',
    })

    const emissions = await emissionsPromise
    expect(emissions).toHaveLength(5)

    expect(emissions).toEqual([
      {
        filter: undefined,
        isPending: false,
        result: null,
        sort: undefined,
      },
      {
        filter: '_type == "author"',
        isPending: true,
        result: null,
        sort: undefined,
      },
      {
        filter: '_type == "author"',
        isPending: false,
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
        sort: undefined,
      },
      {
        filter: '_id == "first-id"',
        isPending: true,
        result: [
          {_id: 'first-id', _type: 'author'},
          {_id: 'second-id', _type: 'author'},
        ],
        sort: undefined,
      },
      {
        filter: '_id == "first-id"',
        isPending: false,
        result: [{_id: 'first-id', _type: 'author'}],
        sort: undefined,
      },
    ])

    const [{result: result1}, {result: result2}, {result: result3}] = emissions.slice(2)

    expect(result1?.[0]).toBe(result2?.[0])
    expect(result2?.[0]).toBe(result3?.[0])
  })

  it('fetches all documents when no filter is set', async () => {
    const result = [
      {_id: 'first-id', _type: 'author'},
      {_id: 'second-id', _type: 'book'},
    ]

    client.observable.fetch.mockImplementation(() =>
      of({
        syncTags: [],
        result,
      }),
    )

    const emissionsPromise = subscribeAndGetEmissions()

    // Don't set any filter
    documentListStore.setOptions({})
    await tick()

    const emissions = await emissionsPromise
    expect(emissions).toHaveLength(3)

    expect(emissions).toEqual([
      {filter: undefined, isPending: false, result: null, sort: undefined},
      {filter: undefined, isPending: true, result: null, sort: undefined},
      {filter: undefined, isPending: false, result, sort: undefined},
    ])

    expect(client.observable.fetch).toHaveBeenCalledTimes(1)
    expect(client.observable.fetch.mock.calls[0]).toEqual([
      '*[0..$__limit]{_id, _type}',
      {__limit: 50},
      {
        filterResponse: false,
        lastLiveEventId: undefined,
        returnQuery: false,
        tag: 'sdk.document-list',
      },
    ])
  })
})
