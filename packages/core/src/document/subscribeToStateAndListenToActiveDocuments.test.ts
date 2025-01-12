import type {OptimisticStore} from '@sanity/mutate/_unstable_store'
import type {SanityDocumentLike} from '@sanity/types'
import {omit} from 'lodash-es'
import {Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createSanityInstance} from '../instance/sanityInstance'
import {createResourceState, type ResourceState} from '../resources/createResource'
import {documentStore, type DocumentStoreState} from './documentStore'
import {subscribeToStateAndListenToActiveDocuments} from './subscribeToStateAndListenToActiveDocuments'

describe('subscribeToStateAndListenToActiveDocuments', () => {
  const instance = createSanityInstance({projectId: 'p', dataset: 'd'})
  const initialState = documentStore.getInitialState(instance)
  let state: ResourceState<DocumentStoreState>

  beforeEach(() => {
    state = createResourceState(initialState)
  })

  it('listens to subscription changes and calls optimisticStore.listen once per document', () => {
    const teardown = vi.fn()
    const document$ = new Subject<SanityDocumentLike | undefined>()
    const listen = vi.fn(() => {
      return new Observable((observer) => {
        const subscription = document$.subscribe(observer)
        return () => {
          subscription.unsubscribe()
          teardown()
        }
      })
    })
    state.set('setOptimisticStore', {optimisticStore: {listen} as unknown as OptimisticStore})

    const subscription = subscribeToStateAndListenToActiveDocuments({instance, state})
    expect(listen).not.toHaveBeenCalled()

    // add one subscription
    state.set('addSubscription', (prev) => ({
      subscriptions: {
        ...prev.subscriptions,
        exampleDocumentId: ['exampleSubscriptionId'],
      },
    }))

    expect(listen).toHaveBeenCalledTimes(1)
    const exampleDocument = {_id: 'exampleDocumentId', _type: 'exampleType'}
    document$.next(exampleDocument)
    expect(state.get().documents[exampleDocument._id]).toBe(exampleDocument)

    // add another subscription
    state.set('addSubscription', (prev) => ({
      subscriptions: {
        ...prev.subscriptions,
        exampleDocumentId: [
          ...(prev.subscriptions[exampleDocument._id] ?? []),
          'newSubscriptionId',
        ],
      },
    }))
    expect(listen).toHaveBeenCalledTimes(1)

    // try removing the document
    document$.next(undefined)
    expect(state.get().documents[exampleDocument._id]).toBe(null)

    // try removing the subscription
    expect(teardown).not.toHaveBeenCalled()
    state.set('removeSubscription', (prev) => ({
      subscriptions: omit(prev.subscriptions, exampleDocument._id),
    }))
    expect(teardown).toHaveBeenCalledTimes(1)

    subscription.unsubscribe()
  })

  it('cleans up previous listen calls if the optimisticStore changes', () => {
    const teardownA = vi.fn()
    const listenA = vi.fn(() => {
      return new Observable(() => teardownA)
    })

    const teardownB = vi.fn()
    const listenB = vi.fn(() => {
      return new Observable(() => teardownB)
    })
    state.set('setOptimisticStore', {
      optimisticStore: {listen: listenA} as unknown as OptimisticStore,
    })

    const subscription = subscribeToStateAndListenToActiveDocuments({instance, state})
    expect(listenA).not.toHaveBeenCalled()
    expect(listenB).not.toHaveBeenCalled()

    // add one subscription
    state.set('addSubscription', (prev) => ({
      subscriptions: {
        ...prev.subscriptions,
        exampleDocumentId: ['exampleSubscriptionId'],
      },
    }))
    expect(listenA).toHaveBeenCalledTimes(1)
    expect(listenB).not.toHaveBeenCalled()

    expect(teardownA).not.toHaveBeenCalled()
    expect(teardownB).not.toHaveBeenCalled()

    state.set('setOptimisticStore', {
      optimisticStore: {listen: listenB} as unknown as OptimisticStore,
    })
    expect(teardownA).toHaveBeenCalledTimes(1)
    expect(teardownB).not.toHaveBeenCalled()

    subscription.unsubscribe()
    expect(teardownB).toHaveBeenCalledTimes(1)
  })

  it('sets an error if any occur from the client stream', () => {
    const subject = new Subject()
    // overwrite the state observable
    Object.assign(state, {observable: subject})

    subscribeToStateAndListenToActiveDocuments({instance, state})
    expect(state.get().error).toBe(undefined)

    const testError = new Error('test error')
    subject.error(testError)
    expect(state.get().error).toBe(testError)
  })
})
