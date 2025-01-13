import type {SanityClient} from '@sanity/client'
import {combineLatest, distinctUntilChanged, filter, map, Observable, switchMap} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import type {PreviewStoreState} from './previewStore'
import {PREVIEW_TAG} from './util'

export const subscribeToLiveAndSetLastLiveEventId = createInternalAction(
  ({instance, state}: ActionContext<PreviewStoreState>) => {
    const client$ = new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: 'vX'}).subscribe(observer),
    )
    const syncTags$ = state.observable.pipe(
      map((i) => i.syncTags),
      distinctUntilChanged(),
    )

    return function () {
      const messageEvents$ = client$.pipe(
        switchMap((client) =>
          client.live
            .events({includeDrafts: !!client.config().token, tag: PREVIEW_TAG})
            .pipe(filter((e): e is Extract<typeof e, {type: 'message'}> => e.type === 'message')),
        ),
      )

      return combineLatest([messageEvents$, syncTags$]).subscribe({
        next: ([event, currentSyncTags]) => {
          for (const tag of event.tags) {
            if (currentSyncTags[tag]) {
              state.set('setLastLiveEventId', {lastLiveEventId: event.id})
              return
            }
          }
        },
      })
    }
  },
)
