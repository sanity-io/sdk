import type {LiveEventMessage} from '@sanity/client'
import {Observable, of, Subject} from 'rxjs'
import {describe, it, type Mock, vi} from 'vitest'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createSanityInstance} from '../instance/sanityInstance'
import {
  createResourceState,
  getOrCreateResource,
  type ResourceState,
} from '../resources/createResource'
import {previewStore, type PreviewStoreState} from './previewStore'
import {subscribeToLiveAndSetLastLiveEventId} from './subscribeToLiveAndSetLastLiveEventId'

vi.mock('../client/actions/getSubscribableClient', () => ({
  getSubscribableClient: vi.fn(),
}))

vi.mock('../resources/createResource', async (importOriginal) => {
  const original = await importOriginal<typeof import('../resources/createResource')>()
  return {...original, getOrCreateResource: vi.fn()}
})

describe('subscribeToLiveAndSetLastLiveEventId', () => {
  const instance = createSanityInstance({projectId: 'exampleProject', dataset: 'exampleDataset'})
  const initialState: PreviewStoreState = {
    documentTypes: {},
    lastLiveEventId: null,
    subscriptions: {},
    syncTags: {},
    values: {},
  }
  let state: ResourceState<PreviewStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
    vi.clearAllMocks()
  })

  it('listens for matching sync tags and updates the `lastLiveEventId`', async () => {
    const mockLiveEvents = new Observable<LiveEventMessage>((observer) => {
      observer.next({
        type: 'message',
        id: 'event123',
        tags: ['s1:tag1', 's1:tag2'],
      })
    })

    const mockClient = {
      live: {
        events: vi.fn().mockReturnValue(mockLiveEvents),
      },
      config: vi.fn().mockReturnValue({}),
    }

    // Mock the getSubscribableClient to emit our mock client
    ;(getSubscribableClient as Mock).mockReturnValue(of(mockClient))

    // Set up initial state with a matching sync tag
    state.set('setSyncTags', {
      syncTags: {
        's1:tag1': true,
      },
    })

    // Subscribe to live events
    const subscription = subscribeToLiveAndSetLastLiveEventId({instance, state})

    // Verify the client was configured correctly
    expect(mockClient.live.events).toHaveBeenCalledWith({
      includeDrafts: false,
      tag: expect.any(String),
    })

    // Verify the state was updated with the new event ID
    expect(state.get().lastLiveEventId).toBe('event123')

    // Clean up subscription
    subscription.unsubscribe()
  })

  it('unsubscribes from the previous live content connection if any', () => {
    const unsubscribe = vi.fn()

    const mockLiveEvents = new Observable<LiveEventMessage>((observer) => {
      observer.next({
        type: 'message',
        id: 'event123',
        tags: ['s1:tag1'],
      })

      return unsubscribe
    })

    const mockClient = {
      live: {
        events: vi.fn().mockReturnValue(mockLiveEvents),
      },
      config: vi.fn().mockReturnValue({}),
    }

    const clientSubject = new Subject()
    ;(getSubscribableClient as Mock).mockReturnValue(clientSubject)

    const liveSubscription = subscribeToLiveAndSetLastLiveEventId({instance, state})
    clientSubject.next(mockClient)

    expect(mockClient.live.events).toHaveBeenCalledTimes(1)

    const newClient = {...mockClient}
    clientSubject.next(newClient)
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    // Clean up subscriptions
    liveSubscription.unsubscribe()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('calls getOrCreateResource if no state is provided', () => {
    ;(getOrCreateResource as Mock).mockReturnValue({state})
    subscribeToLiveAndSetLastLiveEventId(instance)
    expect(getOrCreateResource).toHaveBeenCalledWith(instance, previewStore)
  })
})
