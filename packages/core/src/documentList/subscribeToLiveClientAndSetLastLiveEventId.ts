import {filter, map, switchMap, withLatestFrom} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {API_VERSION} from './documentListConstants'
import {type DocumentListState} from './documentListStore'

export const subscribeToLiveClientAndSetLastLiveEventId = createInternalAction(
  ({state, instance}: ActionContext<DocumentListState>) => {
    const liveEventMessage$ = getClientState(instance, {apiVersion: API_VERSION}).observable.pipe(
      switchMap((client) =>
        client.live.events({includeDrafts: !!client.config().token, tag: 'sdk.document-list'}),
      ),
      filter((e) => e.type === 'message'),
      withLatestFrom(state.observable.pipe(map(({syncTags}) => syncTags))),
    )

    return function () {
      return liveEventMessage$.subscribe(([event, syncTags]) => {
        if (event.tags.some((tag) => syncTags.includes(tag))) {
          state.set('updateEventIdFromLiveContentApi', {lastLiveEventId: event.id})
        }
      })
    }
  },
)
