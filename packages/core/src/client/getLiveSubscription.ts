import type {LiveClient, SanityClient} from '@sanity/client'
import {distinctUntilChanged, Observable, shareReplay, switchMap} from 'rxjs'

import type {SanityInstance} from '../instance/types'
import {getClient} from './getClient'
import {getSubscribableClient} from './getSubscribableClient'

const API_VERSION = 'vX'

const subscriptionCache = new WeakMap<SanityInstance, ReturnType<LiveClient['events']>>()

/**
 * A singleton subscription to the live content API.
 *
 * @returns A subscribable stream of live content API events.
 *
 * @internal
 */
export function getLiveSubscription(instance: SanityInstance): ReturnType<LiveClient['events']> {
  // Check if we already have a cached subscription for this instance
  let cachedSubscription = subscriptionCache.get(instance)

  if (!cachedSubscription) {
    const client$ = new Observable<SanityClient>((observer) => {
      observer.next(getClient({apiVersion: API_VERSION}, instance))
      const subscription = getSubscribableClient({apiVersion: API_VERSION}, instance).subscribe(
        observer,
      )
      return () => subscription.unsubscribe()
    }).pipe(distinctUntilChanged())

    cachedSubscription = client$.pipe(
      switchMap((client) =>
        client.live.events({includeDrafts: !!client.config().token, tag: 'sdk'}),
      ),
      shareReplay(1), // This will share the subscription and replay the last emitted value
    )

    // Store the subscription in the cache
    subscriptionCache.set(instance, cachedSubscription)
  }

  return cachedSubscription
}
