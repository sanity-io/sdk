import {type SanityClient} from '@sanity/client'
import {filter, map, Observable, switchMap, withLatestFrom} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {API_VERSION} from './documentListConstants'
import {type DocumentListState} from './documentListStore'

export const subscribeToLiveClientAndSetLastLiveEventId = createInternalAction(
  ({state, instance}: ActionContext<DocumentListState>) => {
    const liveEventMessage$ = new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {
        apiVersion: API_VERSION,
        projectId: state.get().options.resourceId?.split(':')[1] ?? '',
        dataset: state.get().options.resourceId?.split(':')[2] ?? '',
      }).subscribe(observer),
    ).pipe(
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
