import {type SanityClient} from '@sanity/client'
import {debounceTime, filter, firstValueFrom, of, Subject} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

import {getClientState} from '../client/clientStore'
import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {type StateSource} from '../resources/createStateSourceAction'
import {type DocumentListState} from './documentListStore'
import {subscribeToLiveClientAndSetLastLiveEventId} from './subscribeToLiveClientAndSetLastLiveEventId'

vi.mock('../client/clientStore.ts', () => ({getClientState: vi.fn()}))

describe('subscribeToLiveClientAndSetLastLiveEventId', () => {
  const mockClientLiveEvents = vi.fn()

  const liveEventSubject = new Subject()

  mockClientLiveEvents.mockReturnValue(liveEventSubject)
  const mockClient = {
    config: vi.fn().mockReturnValue({}),
    live: {events: mockClientLiveEvents},
  }
  const instance = createSanityInstance({
    resources: [
      {
        projectId: 'p',
        dataset: 'd',
      },
    ],
  })
  let state: ResourceState<DocumentListState>

  beforeEach(() => {
    vi.mocked(getClientState).mockReturnValue({
      observable: of(mockClient as unknown as SanityClient),
    } as StateSource<SanityClient>)

    state = createResourceState<DocumentListState>({
      limit: 25,
      options: {perspective: 'previewDrafts'},
      results: [],
      syncTags: [],
      isPending: false,
      count: 0,
    })
  })

  it('should update state with last live event id if tags match', async () => {
    const mockEvent = {
      id: 'live-event-id',
      type: 'message',
      tags: ['s1:tag1'],
    }

    state.set('updateFromFetch', {
      syncTags: ['s1:tag1'],
      results: [],
      isPending: false,
    })

    const statePromise = firstValueFrom(
      state.observable.pipe(filter((s) => s.lastLiveEventId === 'live-event-id')),
    )
    const subscription = subscribeToLiveClientAndSetLastLiveEventId({state, instance})

    liveEventSubject.next(mockEvent)

    await expect(statePromise).resolves.toMatchObject({lastLiveEventId: 'live-event-id'})

    subscription.unsubscribe()
  })

  it('should not update state with last live event id if tags do not match', async () => {
    state.set('updateFromFetch', {
      syncTags: ['s1:tag1'],
      results: [],
      isPending: false,
      lastLiveEventId: 'no event',
    })
    const finalStatePromise = firstValueFrom(state.observable.pipe(debounceTime(100)))

    const subscription = subscribeToLiveClientAndSetLastLiveEventId({state, instance})

    liveEventSubject.next({
      id: 'live-event-id',
      type: 'message',
      tags: ['s2:tag2'],
    })

    await expect(finalStatePromise).resolves.toMatchObject({lastLiveEventId: 'no event'})

    subscription.unsubscribe()
  })

  it('should not update state with last live event id if event type is not message', async () => {
    state.set('updateFromFetch', {
      syncTags: ['s1:tag1'],
      results: [],
      isPending: false,
      lastLiveEventId: 'no event',
    })
    const finalStatePromise = firstValueFrom(state.observable.pipe(debounceTime(100)))

    const subscription = subscribeToLiveClientAndSetLastLiveEventId({state, instance})

    liveEventSubject.next({
      id: 'some-event-id',
      type: 'mutation',
    })

    await expect(finalStatePromise).resolves.toMatchObject({lastLiveEventId: 'no event'})

    subscription.unsubscribe()
  })
})
