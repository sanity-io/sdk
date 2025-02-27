import {SanityClient, type SyncTag} from '@sanity/client'
import {Observable, of, Subject} from 'rxjs'
import {describe, expect, it, type Mock, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {hashString} from '../common/util'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {type StateSource} from '../resources/createStateSourceAction'
import {type ProjectionQueryResult, type ProjectionStoreState} from './projectionStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

vi.mock('../client/clientStore.ts', () => ({getClientState: vi.fn()}))
vi.mock('../resources/createResource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../resources/createResource')>()
  return {...original, getOrCreateResource: vi.fn()}
})

describe('subscribeToStateAndFetchBatches', () => {
  const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

  let state: ResourceState<ProjectionStoreState>
  let fetchResults: Subject<{result: ProjectionQueryResult[]; syncTags: SyncTag[]}>
  let mockFetch: Mock

  beforeEach(() => {
    state = createResourceState<ProjectionStoreState>({
      documentProjections: {},
      lastLiveEventId: null,
      subscriptions: {},
      syncTags: {},
      values: {},
    })
    fetchResults = new Subject()

    mockFetch = vi.fn().mockImplementation(
      () =>
        new Observable((subscriber) => {
          const subscription = fetchResults.subscribe({
            next: (val) => subscriber.next(val),
            complete: () => subscriber.complete(),
          })
          return () => subscription.unsubscribe()
        }),
    )
    vi.mocked(getClientState).mockReturnValue({
      observable: of({observable: {fetch: mockFetch}} as unknown as SanityClient),
    } as StateSource<SanityClient>)
  })

  it('batches rapid subscription changes into single requests', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})
    const projection = 'title, description'
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

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      [`__ids_${projectionHash}`]: ['doc1', 'drafts.doc1', 'doc2', 'drafts.doc2'],
    })

    subscription.unsubscribe()
  })

  it('always uses latest client/eventId state when fetching', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription
    state.set('addSubscription', {
      documentProjections: {doc1: 'title, description'},
      subscriptions: {doc1: {sub1: true}},
    })

    // Update lastLiveEventId
    state.set('updateEventId', {lastLiveEventId: 'event1'})

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        lastLiveEventId: 'event1',
      }),
    )

    subscription.unsubscribe()
  })

  it('handles new subscriptions optimistically with pending states', async () => {
    state.set('initializeValues', {
      documentProjections: {doc1: 'title, description', doc2: 'title, description'},
      values: {doc1: {results: {title: 'Doc 1'}, isPending: false}},
      subscriptions: {doc1: {sub1: true}},
    })

    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription for a document already in the batch
    state.set('addSubscriptionAlreadyInBatch', (prev) => ({
      subscriptions: {doc1: {sub1: true, ...prev.subscriptions['doc1'], sub2: true}},
    }))

    // this isn't a new subscription so it isn't pending by design.
    // the pending state is intended to only appear for new documents
    expect(state.get().values['doc1']).toEqual({results: {title: 'Doc 1'}, isPending: false})

    expect(state.get().values['doc2']).toBeUndefined()

    state.set('addSubscriptionNotInBatch', {
      subscriptions: {doc2: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(state.get().values['doc2']).toEqual({results: null, isPending: true})

    subscription.unsubscribe()
  })

  it('cancels and restarts fetches when subscription set changes', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add initial subscription
    state.set('addSubscription1', {
      documentProjections: {doc1: 'title, description'},
      subscriptions: {doc1: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Add another subscription before first fetch completes
    state.set('addSubscription2', (prev) => ({
      documentProjections: {...prev.documentProjections, doc2: 'title, description'},
      subscriptions: {...prev.subscriptions, doc2: {sub2: true}},
    }))

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockFetch).toHaveBeenCalledTimes(2)

    subscription.unsubscribe()
  })

  it('only refetches when actually needed due to distinctUntilChanged() usage', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription
    state.set('addSubscription', {
      documentProjections: {doc1: 'title, description'},
      subscriptions: {doc1: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Update state but don't change subscriptions
    state.set('unrelatedChange', {
      syncTags: {'s1:tag1': true},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockFetch).toHaveBeenCalledTimes(1)

    subscription.unsubscribe()
  })

  it('processes and applies fetch results correctly', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription
    state.set('addSubscription', {
      documentProjections: {doc1: 'title, description'},
      subscriptions: {doc1: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Emit fetch results
    fetchResults.next({
      result: [
        {
          _id: 'doc1',
          _type: 'test',
          _updatedAt: '2024-01-01T00:00:00Z',
          result: {title: 'Test Document', description: 'Test Description'},
        },
      ],
      syncTags: ['s1:tag1', 's1:tag2'],
    })

    // Check that the state was updated
    expect(state.get().values['doc1']).toEqual({
      results: expect.objectContaining({
        title: 'Test Document',
        description: 'Test Description',
        status: {
          lastEditedPublishedAt: '2024-01-01T00:00:00Z',
        },
      }),
      isPending: false,
    })
    expect(state.get().syncTags).toEqual({
      's1:tag1': true,
      's1:tag2': true,
    })

    subscription.unsubscribe()
  })
})
