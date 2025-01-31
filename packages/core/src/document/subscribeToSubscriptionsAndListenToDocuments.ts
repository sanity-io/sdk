import {
  distinctUntilChanged,
  EMPTY,
  groupBy,
  map,
  mergeMap,
  of,
  pairwise,
  switchMap,
  tap,
} from 'rxjs'

import {type ActionContext, createInternalAction} from '../resources/createAction'
import {applyRemote} from './applyRemote'
import {type DocumentStoreState} from './documentStore'
import {listen} from './listen'

export const subscribeToSubscriptionsAndListenToDocuments = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    const subscriptionChanges$ = state.observable.pipe(
      map((s) => Object.keys(s.documents)),
      distinctUntilChanged((curr, next) => {
        if (curr.length !== next.length) return false
        const currSet = new Set(curr)
        return next.every((i) => currSet.has(i))
      }),
      pairwise(),
      switchMap((pair) => {
        const [curr, next] = pair.map((ids) => new Set(ids))
        const added = Array.from(next).filter((i) => !curr.has(i))
        const removed = Array.from(curr).filter((i) => !next.has(i))

        return of<{id: string; type: 'add' | 'remove'}[]>(
          ...added.map((id) => ({id, type: 'add'}) as const),
          ...removed.map((id) => ({id, type: 'remove'}) as const),
        )
      }),
      groupBy((i) => i.id),
    )

    return function () {
      return subscriptionChanges$
        .pipe(
          mergeMap((subscriptionChange) =>
            subscriptionChange.pipe(
              switchMap(({type, id}) => (type === 'add' ? listen(this, id) : EMPTY)),
            ),
          ),
          tap((remote) => {
            state.set('applyRemote', (prev) => applyRemote({remote, ...prev}))
          }),
        )
        .subscribe({error: (error) => state.set('setError', {error})})
    }
  },
)
