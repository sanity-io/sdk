import {NEVER, Observable, type Observer} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {getQueryState, resolveQuery} from '../query/queryStore'
import {createSanityInstance, type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {createStoreState, type StoreState} from '../store/createStoreState'
import {type PreviewQueryResult, type PreviewStoreState} from './previewStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'
import {PREVIEW_PERSPECTIVE, PREVIEW_TAG} from './util'

vi.mock('../query/queryStore')

describe('subscribeToStateAndFetchBatches', () => {
  let instance: SanityInstance
  let state: StoreState<PreviewStoreState>

  beforeEach(() => {
    vi.clearAllMocks()
    instance = createSanityInstance({projectId: 'test', dataset: 'test'})
    state = createStoreState<PreviewStoreState>({
      subscriptions: {},
      values: {},
    })

    vi.mocked(getQueryState).mockReturnValue({
      getCurrent: () => undefined,
      observable: NEVER as Observable<PreviewQueryResult[] | undefined>,
    } as StateSource<PreviewQueryResult[] | undefined>)

    vi.mocked(resolveQuery).mockResolvedValue(undefined)
  })

  afterEach(() => {
    instance.dispose()
  })

  it('batches rapid subscription changes into single requests', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add multiple subscriptions rapidly
    state.set('addSubscription1', {
      subscriptions: {doc1: {sub1: true}},
    })

    state.set('addSubscription2', (prev) => ({
      subscriptions: {...prev.subscriptions, doc2: {sub2: true}},
    }))

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(getQueryState).toHaveBeenCalledTimes(1)
    expect(getQueryState).toHaveBeenCalledWith(
      instance,
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({
          __ids_71322c7a: ['doc1', 'drafts.doc1', 'doc2', 'drafts.doc2'],
        }),
        perspective: PREVIEW_PERSPECTIVE,
        tag: PREVIEW_TAG,
      }),
    )

    subscription.unsubscribe()
  })

  it('processes query results and updates state with resolved values', async () => {
    const teardown = vi.fn()
    const subscriber = vi
      .fn<(observer: Observer<PreviewQueryResult[] | undefined>) => () => void>()
      .mockReturnValue(teardown)

    vi.mocked(getQueryState).mockReturnValue({
      getCurrent: () => undefined,
      observable: new Observable(subscriber),
    } as StateSource<PreviewQueryResult[] | undefined>)

    const subscription = subscribeToStateAndFetchBatches({instance, state})

    expect(subscriber).not.toHaveBeenCalled()

    // Add a subscription
    state.set('addSubscription', {
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
        _type: 'test',
        _updatedAt: timestamp,
        titleCandidates: {title: 'Test Document'},
        subtitleCandidates: {description: 'Test Description'},
      },
    ])

    const {values} = state.get()
    expect(values['doc1']).toEqual({
      isPending: false,
      data: expect.objectContaining({
        title: 'Test Document',
      }),
    })

    subscription.unsubscribe()
    expect(teardown).toHaveBeenCalled()
  })

  it('handles new subscriptions optimistically with pending states', async () => {
    state.set('initializeValues', {
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
      subscriptions: {doc1: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Add another subscription before first fetch completes
    state.set('addSubscription2', (prev) => ({
      subscriptions: {...prev.subscriptions, doc2: {sub2: true}},
    }))

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(getQueryState).toHaveBeenCalledTimes(2)
    expect(abortSpy).toHaveBeenCalled()

    subscription.unsubscribe()
  })

  it('processes and applies fetch results correctly', async () => {
    const subscriber = vi.fn<(observer: Observer<PreviewQueryResult[] | undefined>) => () => void>()

    vi.mocked(getQueryState).mockReturnValue({
      getCurrent: () => undefined,
      observable: new Observable(subscriber),
    } as StateSource<PreviewQueryResult[] | undefined>)

    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription
    state.set('addSubscription', {
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
        titleCandidates: {title: 'Test Document'},
        subtitleCandidates: {description: 'Test Description'},
      },
    ])

    // Check that the state was updated
    expect(state.get().values['doc1']).toEqual({
      data: expect.objectContaining({
        title: 'Test Document',
      }),
      isPending: false,
    })

    subscription.unsubscribe()
  })
})
