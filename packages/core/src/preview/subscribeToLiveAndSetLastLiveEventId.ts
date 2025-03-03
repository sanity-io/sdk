import {combineLatest, distinctUntilChanged, filter, map, switchMap} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {type PreviewStoreState} from './previewStore'
import {PREVIEW_TAG} from './util'

export const subscribeToLiveAndSetLastLiveEventId = createInternalAction(
  ({instance, state}: ActionContext<PreviewStoreState>) => {
    const syncTags$ = state.observable.pipe(
      map((i) => i.syncTags),
      distinctUntilChanged(),
    )

    return function () {
      const messageEvents$ = getClientState(instance, {apiVersion: 'vX'}).observable.pipe(
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
