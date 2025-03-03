import {isEqual, pick} from 'lodash-es'
import {debounceTime, distinctUntilChanged, map, switchMap, tap, withLatestFrom} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type ActionContext, createInternalAction} from '../resources/createAction'
import {API_VERSION} from './documentListConstants'
import {type DocumentHandle, type DocumentListState} from './documentListStore'

export interface DocumentListQueryResult {
  count: number
  results: DocumentHandle[]
}

export const subscribeToStateAndFetchResults = createInternalAction(
  ({state, instance}: ActionContext<DocumentListState>) => {
    return function () {
      const fetchInput$ = state.observable.pipe(
        map((s) => pick(s, 'options', 'limit', 'lastLiveEventId')),
        distinctUntilChanged(isEqual as <T>(a: T, b: T) => boolean),
      )

      return fetchInput$
        .pipe(
          withLatestFrom(getClientState(instance, {apiVersion: API_VERSION}).observable),
          debounceTime(0),
          tap(() => {
            state.set('setPending', {isPending: true})
          }),
          switchMap(([{options, limit, lastLiveEventId}, client]) => {
            const filter = options.filter ? `[${options.filter}]` : ''
            const order = options.sort
              ? `| order(${options.sort
                  .map((ordering) =>
                    [ordering.field, ordering.direction.toLowerCase()]
                      .map((str) => str.trim())
                      .filter(Boolean)
                      .join(' '),
                  )
                  .join(',')})`
              : ''

            const resultsQuery = `*${filter}${order}[0...$__limit]{_id, _type}`
            const countQuery = `count(*${filter})`

            return client.observable.fetch<DocumentListQueryResult>(
              `{"count":${countQuery},"results":${resultsQuery}}`,
              {__limit: limit},
              {
                filterResponse: false,
                returnQuery: false,
                lastLiveEventId,
                tag: 'sdk.document-list',
                perspective: 'previewDrafts',
              },
            )
          }),
        )
        .subscribe({
          next: ({syncTags, result: {count, results}}) => {
            state.set('updateFromFetch', {
              syncTags,
              results,
              count,
              isPending: false,
            })
          },
        })
    }
  },
)
