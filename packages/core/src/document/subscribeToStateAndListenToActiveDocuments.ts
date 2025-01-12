import type {SanityDocumentLike} from '@sanity/types'
import {
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  filter,
  groupBy,
  map,
  mergeMap,
  of,
  pairwise,
  switchMap,
} from 'rxjs'

import {type ActionContext, createInternalAction} from '../resources/createAction'
import type {DocumentStoreState} from './documentStore'

export const subscribeToStateAndListenToActiveDocuments = createInternalAction(
  ({state}: ActionContext<DocumentStoreState>) => {
    const optimisticStore$ = state.observable.pipe(
      map((s) => s.optimisticStore),
      filter(<T>(t: T): t is NonNullable<T> => !!t),
      distinctUntilChanged(),
    )

    const subscriptionChanges$ = state.observable.pipe(
      map((s) => Object.keys(s.subscriptions)),
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

    const document$ = subscriptionChanges$.pipe(
      mergeMap((subscriptionChange) =>
        combineLatest([subscriptionChange, optimisticStore$]).pipe(
          switchMap(([{type, id}, optimisticStore]) =>
            type === 'add'
              ? optimisticStore
                  .listen(id)
                  .pipe(map((value) => ({id, value: value as SanityDocumentLike})))
              : EMPTY,
          ),
        ),
      ),
    )

    return function () {
      return document$.subscribe({
        next: ({id, value}) => {
          state.set('updateDocumentValue', (prev) => ({
            documents: {...prev.documents, [id]: value ?? null},
          }))
        },
        error: (error) => state.set('setError', {error}),
      })
    }
  },
)
