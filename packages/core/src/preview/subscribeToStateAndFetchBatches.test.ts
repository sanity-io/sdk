import {type SyncTag} from '@sanity/client'
import {Schema as SchemaConstructor} from '@sanity/schema'
import {type Schema} from '@sanity/types'
import {Observable, of, Subject} from 'rxjs'
import {describe, expect, it, type Mock, vi} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {getSchemaState} from '../schema/getSchemaState'
import {type PreviewQueryResult, type PreviewStoreState} from './previewStore'
import {subscribeToStateAndFetchBatches} from './subscribeToStateAndFetchBatches'

vi.mock('../client/actions/getSubscribableClient')
vi.mock('../schema/getSchemaState')
vi.mock('../resources/createResource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../resources/createResource')>()
  return {...original, getOrCreateResource: vi.fn()}
})

describe('subscribeToStateAndFetchBatches', () => {
  const instance = createSanityInstance({projectId: 'test', dataset: 'test'})

  const schema: Schema = SchemaConstructor.compile({
    name: 'default',
    types: [
      {
        name: 'test',
        type: 'document',
        fields: [{name: 'title', type: 'string'}],
      },
    ],
  })

  let state: ResourceState<PreviewStoreState>
  let fetchResults: Subject<{result: PreviewQueryResult[]; syncTags: SyncTag[]}>
  let mockFetch: Mock

  beforeEach(() => {
    state = createResourceState<PreviewStoreState>({
      documentTypes: {},
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
    ;(getSubscribableClient as Mock).mockReturnValue(of({observable: {fetch: mockFetch}}))
    ;(getSchemaState as Mock).mockImplementation(() => ({
      getCurrent: () => schema,
      subscribe: vi.fn(() => vi.fn()),
      observable: of(schema),
    }))
  })

  it('batches rapid subscription changes into single requests', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add multiple subscriptions rapidly
    state.set('addSubscription1', {
      documentTypes: {doc1: 'test'},
      subscriptions: {doc1: {sub1: true}},
    })

    state.set('addSubscription2', (prev) => ({
      documentTypes: {...prev.documentTypes, doc2: 'test'},
      subscriptions: {...prev.subscriptions, doc2: {sub2: true}},
    }))

    // Wait for debounce
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      __ids_16144029: ['doc1', 'drafts.doc1', 'doc2', 'drafts.doc2'],
    })

    subscription.unsubscribe()
  })

  it('always uses latest client/schema/eventId state when fetching', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription
    state.set('addSubscription', {
      documentTypes: {doc1: 'test'},
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
      documentTypes: {doc1: 'test', doc2: 'test'},
      values: {doc1: [{title: 'Doc 1'}, false]},
      subscriptions: {doc1: {sub1: true}},
    })

    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add a subscription for a document already in the batch
    state.set('addSubscriptionAlreadyInBatch', (prev) => ({
      subscriptions: {doc1: {sub1: true, ...prev.subscriptions['doc1'], sub2: true}},
    }))

    // this isn't a new subscription so it isn't pending by design.
    // the pending state is intended to only appear for new documents
    expect(state.get().values['doc1']).toEqual([{title: 'Doc 1'}, false])

    expect(state.get().values['doc2']).toBeUndefined()

    state.set('addSubscriptionNotInBatch', {
      subscriptions: {doc2: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(state.get().values['doc2']).toEqual([null, true])

    subscription.unsubscribe()
  })

  it('cancels and restarts fetches when subscription set changes', async () => {
    const subscription = subscribeToStateAndFetchBatches({instance, state})

    // Add initial subscription
    state.set('addSubscription1', {
      documentTypes: {doc1: 'test'},
      subscriptions: {doc1: {sub1: true}},
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    // Add another subscription before first fetch completes
    state.set('addSubscription2', (prev) => ({
      documentTypes: {...prev.documentTypes, doc2: 'test'},
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
      documentTypes: {doc1: 'test'},
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
      documentTypes: {doc1: 'test'},
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
          select: {title: 'Test Document'},
        },
      ],
      syncTags: ['s1:tag1', 's1:tag2'],
    })

    // Check that the state was updated
    expect(state.get().values['doc1']).toEqual([
      expect.objectContaining({title: 'Test Document'}),
      false,
    ])
    expect(state.get().syncTags).toEqual({
      's1:tag1': true,
      's1:tag2': true,
    })

    subscription.unsubscribe()
  })
})
