import {NEVER, Observable, type Observer} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {getQueryState, resolveQuery} from '../query/queryStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createStoreState, type StoreState} from '../store/createStoreState'
import {hashString} from '../utils/hashString'
import {type ProjectionQueryResult, type ProjectionStoreState} from './projectionStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

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
      documentProjections: {doc1: projection},
      subscriptions: {doc1: {sub1: true}},
    })

    state.set('addSubscription2', (prev) => ({
      documentProjections: {...prev.documentProjections, doc2: projection},
      subscriptions: {...prev.subscriptions, doc2: {sub2: true}},
    }))

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(getQueryState).toHaveBeenCalledTimes(1)
    expect(getQueryState).toHaveBeenCalledWith(
      instance,
      expect.any(String),
      expect.objectContaining({
        params: {
          [`__ids_${projectionHash}`]: ['doc1', 'drafts.doc1', 'doc2', 'drafts.doc2'],
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

    expect(subscriber).not.toHaveBeenCalled()

    // Add a subscription
    state.set('addSubscription', {
      documentProjections: {doc1: '{title}'},
      subscriptions: {doc1: {sub1: true}},
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
      },
      {
        _id: 'drafts.doc1',
        _type: 'doc',
        _updatedAt: timestamp,
        result: {title: 'resolved'},
      },
    ])

    const {values} = state.get()
    expect(values['doc1']).toEqual({
      isPending: false,
      data: {
        title: 'resolved',
        status: {
          lastEditedDraftAt: timestamp,
          lastEditedPublishedAt: timestamp,
        },
      },
    })

    subscription.unsubscribe()
    expect(teardown).toHaveBeenCalled()
  })

  it('handles new subscriptions optimistically with pending states', async () => {
    state.set('initializeValues', {
      documentProjections: {doc1: '{title, description}', doc2: '{title, description}'},
      values: {doc1: {data: {title: 'Doc 1'}, isPending: false}},
      subscriptions: {doc1: {sub1: true}},
    })

    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription for a document already in the batch
    state.set('addSubscriptionAlreadyInBatch', (prev) => ({
      subscriptions: {doc1: {sub1: true, ...prev.subscriptions['doc1'], sub2: true}},
    }))

    // this isn't a new subscription so it isn't pending by design.
    // the pending state is intended to only appear for new documents
    expect(state.get().values['doc1']).toEqual({data: {title: 'Doc 1'}, isPending: false})

    expect(state.get().values['doc2']).toBeUndefined()

    state.set('addSubscriptionNotInBatch', {
      subscriptions: {doc2: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(state.get().values['doc2']).toEqual({data: null, isPending: true})

    subscription.unsubscribe()
  })

  it('cancels and restarts fetches when subscription set changes', async () => {
    const abortSpy = vi.spyOn(AbortController.prototype, 'abort')
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add initial subscription
    state.set('addSubscription1', {
      documentProjections: {doc1: '{title, description}'},
      subscriptions: {doc1: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Add another subscription before first fetch completes
    state.set('addSubscription2', (prev) => ({
      documentProjections: {...prev.documentProjections, doc2: '{title, description}'},
      subscriptions: {...prev.subscriptions, doc2: {sub2: true}},
    }))

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(getQueryState).toHaveBeenCalledTimes(3)
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

    // Add a subscription
    state.set('addSubscription', {
      documentProjections: {doc1: '{title, description}'},
      subscriptions: {doc1: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(subscriber).toHaveBeenCalled()
    const [observer] = subscriber.mock.lastCall!

    // Emit fetch results
    observer.next([
      {
        _id: 'doc1',
        _type: 'test',
        _updatedAt: '2024-01-01T00:00:00Z',
        result: {title: 'Test Document', description: 'Test Description'},
      },
    ])

    // Check that the state was updated
    expect(state.get().values['doc1']).toEqual({
      data: expect.objectContaining({
        title: 'Test Document',
        description: 'Test Description',
        status: {
          lastEditedPublishedAt: '2024-01-01T00:00:00Z',
        },
      }),
      isPending: false,
    })

    subscription.unsubscribe()
  })
})
