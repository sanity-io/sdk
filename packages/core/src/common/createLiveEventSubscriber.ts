import {combineLatest, distinctUntilChanged, filter, map, type Subscription, switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {type LiveEventAwareState} from './types'

/*
 * Factory function for creating a subscribeToLiveAndSetLastLiveEventId action.
 * Typically invoked in the initialization of stores that depend on the live events API.
 * It listens to events associated with sync tags (also kept internally in the store)

 * Usage like:
 *
 * const subscribeToLiveAndSetLastLiveEventId = createLiveEventSubscriber<ProjectionStoreState<TValue>>(TAG)
 * const liveSubscription = subscribeToLiveAndSetLastLiveEventId(this)
 *
 * return () => {
 *   stateSubscriptionForBatches.unsubscribe()
 *   liveSubscription.unsubscribe()
 */
export function createLiveEventSubscriber<TState extends LiveEventAwareState>(
  tag: string,
): (actionContext: ActionContext<TState>) => Subscription {
  return createInternalAction(({instance, state}: ActionContext<TState>) => {
    const client$ = getClientState(instance, {apiVersion: 'vX'}).observable
    const syncTags$ = state.observable.pipe(
      map((i) => i.syncTags),
      distinctUntilChanged(),
    )

    return function () {
      const messageEvents$ = client$.pipe(
        switchMap((client) =>
          client.live
            .events({includeDrafts: !!client.config().token, tag})
            .pipe(filter((e): e is Extract<typeof e, {type: 'message'}> => e.type === 'message')),
        ),
      )

      return combineLatest([messageEvents$, syncTags$]).subscribe({
        next: ([event, currentSyncTags]) => {
          for (const eventTag of event.tags) {
            if (currentSyncTags[eventTag]) {
              state.set('setLastLiveEventId', (prevState: TState) => ({
                ...prevState,
                lastLiveEventId: event.id,
              }))
              return
            }
          }
        },
      })
    }
  })
}
