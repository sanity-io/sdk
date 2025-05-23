import {NEVER, Observable, type Observer} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {getQueryState, resolveQuery} from '../query/queryStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createStoreState, type StoreState} from '../store/createStoreState'
import {hashString} from '../utils/hashString'
import {type ProjectionQueryResult} from './projectionQuery'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {type ProjectionStoreState} from './types'

vi.mock('../query/queryStore')

describe('subscribeToStateAndFetchBatches', () => {
  let instance: SanityInstance
  let state: StoreState<ProjectionStoreState>

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    state = createStoreState<ProjectionStoreState>({
      documentProjections: {},
      subscriptions: {},
      values: {},
    })

    vi.mocked(getQueryState).mockReturnValue({
      getCurrent: () => undefined,
      observable: NEVER as Observable<ProjectionQueryResult[] | undefined>,
    } as StateSource<ProjectionQueryResult[] | undefined>)

    vi.mocked(resolveQuery).mockResolvedValue(undefined)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('batches rapid subscription changes into single requests', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})
    const projection = '{title, description}'
    const projectionHash = hashString(projection)

    // Add multiple subscriptions rapidly
    state.set('addSubscription1', {
      documentProjections: {doc1: {[projectionHash]: projection}},
      // Add projectionHash level to subscriptions
      subscriptions: {doc1: {[projectionHash]: {sub1: true}}},
    })

    state.set('addSubscription2', (prev) => ({
      documentProjections: {
        ...prev.documentProjections,
        doc2: {[projectionHash]: projection},
      },
      // Add projectionHash level to subscriptions
      subscriptions: {
        ...prev.subscriptions,
        doc2: {[projectionHash]: {sub2: true}},
      },
    }))

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Should still be 1 call because projections are identical
    expect(getQueryState).toHaveBeenCalledTimes(1)
    expect(getQueryState).toHaveBeenCalledWith(
      instance,
      expect.objectContaining({
        query: expect.any(String),
        params: {
          [`__ids_${projectionHash}`]: expect.arrayContaining([
            'doc1',
            'drafts.doc1',
            'doc2',
            'drafts.doc2',
          ]),
        },
      }),
    )

    subscription.unsubscribe()
  })

  it('processes query results and updates state with resolved values', async () => {
    const teardown = vi.fn()
    const subscriber = vi
      .fn<(observer: Observer<ProjectionQueryResult[] | undefined>) => () => void>()
      .mockReturnValue(teardown)

    vi.mocked(getQueryState).mockReturnValue({
      getCurrent: () => undefined,
      observable: new Observable(subscriber),
    } as StateSource<ProjectionQueryResult[] | undefined>)

    const subscription = subscribeToStateAndFetchBatches({instance, state})
    const projection = '{title}'
    const projectionHash = hashString(projection)

    expect(subscriber).not.toHaveBeenCalled()

    // Add a subscription
    state.set('addSubscription', {
      documentProjections: {doc1: {[projectionHash]: projection}},
      subscriptions: {doc1: {[projectionHash]: {sub1: true}}},
    })

    expect(subscriber).not.toHaveBeenCalled()

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(subscriber).toHaveBeenCalled()
    expect(teardown).not.toHaveBeenCalled()

    const [observer] = subscriber.mock.lastCall!

    const timestamp = new Date().toISOString()

    observer.next([
      {
        _id: 'doc1',
        _type: 'doc',
        _updatedAt: timestamp,
        result: {title: 'resolved'},
        __projectionHash: projectionHash,
      },
      {
        _id: 'drafts.doc1',
        _type: 'doc',
        _updatedAt: timestamp,
        result: {title: 'resolved'},
        __projectionHash: projectionHash,
      },
    ])

    const {values} = state.get()
    expect(values['doc1']?.[projectionHash]).toEqual({
      isPending: false,
      data: {
        title: 'resolved',
        _status: {
          lastEditedDraftAt: timestamp,
          lastEditedPublishedAt: timestamp,
        },
      },
    })

    subscription.unsubscribe()
    expect(teardown).toHaveBeenCalled()
  })

  it('handles new subscriptions optimistically with pending states', async () => {
    const projection = '{title, description}'
    const projectionHash = hashString(projection)

    state.set('initializeValues', {
      documentProjections: {
        doc1: {[projectionHash]: projection},
        doc2: {[projectionHash]: projection},
      },
      values: {doc1: {[projectionHash]: {data: {title: 'Doc 1'}, isPending: false}}},
      // Add projectionHash level to subscriptions
      subscriptions: {doc1: {[projectionHash]: {sub1: true}}},
    })

    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add another subscription for doc1 (same hash)
    state.set('addSubscriptionAlreadyInBatch', (prev) => ({
      // Only need to update subscriptions here
      subscriptions: {
        ...prev.subscriptions,
        doc1: {
          ...(prev.subscriptions['doc1'] ?? {}),
          [projectionHash]: {
            ...(prev.subscriptions['doc1']?.[projectionHash] ?? {}),
            sub2: true,
          },
        },
      },
    }))

    // this isn't a new subscription so it isn't pending by design.
    // the pending state is intended to only appear for new documents
    expect(state.get().values['doc1']?.[projectionHash]).toEqual({
      data: {title: 'Doc 1'},
      isPending: false,
    })

    expect(state.get().values['doc2']).toBeUndefined()

    // Add subscription for doc2 (same hash)
    state.set('addSubscriptionNotInBatch', (prev) => ({
      // Only need to update subscriptions here
      subscriptions: {
        ...prev.subscriptions,
        doc2: {
          ...(prev.subscriptions['doc2'] ?? {}),
          [projectionHash]: {
            ...(prev.subscriptions['doc2']?.[projectionHash] ?? {}),
            sub1: true,
          },
        },
      },
    }))

    // Wait for the debounced optimistic update to occur
    await new Promise((resolve) => setTimeout(resolve, 50 + 10)) // Wait slightly longer than debounce (50ms)

    // Check state for doc2 (should now be pending)
    expect(state.get().values['doc2']?.[projectionHash]).toEqual({data: null, isPending: true})

    subscription.unsubscribe()
  })

  it('cancels and restarts fetches when subscription set changes', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    const subscription = subscribeToStateAndFetchBatches({instance, state})
    const projection = '{title, description}'
    const projectionHash = hashString(projection)
    const projection2 = '{_id}' // Different projection
    const projectionHash2 = hashString(projection2)

    // Add initial subscription
    state.set('addSubscription1', {
      documentProjections: {doc1: {[projectionHash]: projection}},
      // Add projectionHash level to subscriptions
      subscriptions: {doc1: {[projectionHash]: {sub1: true}}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    const initialQueryCallCount = vi.mocked(getQueryState).mock.calls.length

    // Add another subscription (different doc, different projection) - This should trigger abort + new fetch
    state.set('addSubscription2', (prev) => ({
      documentProjections: {...prev.documentProjections, doc2: {[projectionHash2]: projection2}},
      // Add projectionHash level to subscriptions
      subscriptions: {
        ...prev.subscriptions,
        doc2: {[projectionHash2]: {sub2: true}},
      },
    }))

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Expected calls:
    // 1. Initial fetch (doc1, hash1)
    // 2. Adding doc2 subscription (optimistic update, no fetch)
    // 3. Debounced fetch for (doc1, hash1) AND (doc2, hash2)
    expect(getQueryState).toHaveBeenCalledTimes(initialQueryCallCount + 1)
    // Abort should have been called because the required projections changed
    expect(abortSpy).toHaveBeenCalled()

    subscription.unsubscribe()
  })

  it('processes and applies fetch results correctly', async () => {
    const subscriber =
      vi.fn<(observer: Observer<ProjectionQueryResult[] | undefined>) => () => void>()

    vi.mocked(getQueryState).mockReturnValue({
      getCurrent: () => undefined,
      observable: new Observable(subscriber),
    } as StateSource<ProjectionQueryResult[] | undefined>)

    const subscription = subscribeToStateAndFetchBatches({instance, state})
    const projection = '{title, description}'
    const projectionHash = hashString(projection)

    // Add a subscription
    state.set('addSubscription', {
      documentProjections: {doc1: {[projectionHash]: projection}},
      // Add projectionHash level to subscriptions
      subscriptions: {doc1: {[projectionHash]: {sub1: true}}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(subscriber).toHaveBeenCalled()
    const [observer] = subscriber.mock.lastCall!

    // Emit fetch results
    const timestamp = '2024-01-01T00:00:00Z'
    observer.next([
      {
        _id: 'doc1',
        _type: 'test',
        _updatedAt: timestamp,
        result: {title: 'Test Document', description: 'Test Description'},
        __projectionHash: projectionHash,
      },
    ])

    // Check that the state was updated
    expect(state.get().values['doc1']?.[projectionHash]).toEqual({
      data: expect.objectContaining({
        title: 'Test Document',
        description: 'Test Description',
        _status: {
          lastEditedPublishedAt: timestamp,
        },
      }),
      isPending: false,
    })

    subscription.unsubscribe()
  })
})
