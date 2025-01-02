import type {SanityClient} from '@sanity/client'
import {filter, map, Observable, switchMap, withLatestFrom} from 'rxjs'

import {getSubscribableClient} from '../client/actions/getSubscribableClient'
import {createAction} from '../resources/createAction'
import {API_VERSION, getDocumentList} from './documentListStore'

export const subscribeToLiveClientAndSetLastLiveEventId = createAction(
  getDocumentList,
  ({state, instance}) => {
    const liveEventMessage$ = new Observable<SanityClient>((observer) =>
      getSubscribableClient(instance, {apiVersion: API_VERSION}).subscribe(observer),
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
