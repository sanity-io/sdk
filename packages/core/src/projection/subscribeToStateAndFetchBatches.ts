import {isEqual} from 'lodash-es'
import {
  combineLatest,
  debounceTime,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  from,
  map,
  Observable,
  pairwise,
  startWith,
  Subscription,
  switchMap,
  tap,
} from 'rxjs'

import {getQueryState, resolveQuery} from '../query/queryStore'
import {type StoreContext} from '../store/defineStore'
import {
  createProjectionQuery,
  processProjectionQuery,
  type ProjectionQueryResult,
} from './projectionQuery'
import {type ProjectionStoreState} from './types'
import {PROJECTION_PERSPECTIVE, PROJECTION_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

const isSetEqual = <T>(a: Set<T>, b: Set<T>) =>
  a.size === b.size && Array.from(a).every((i) => b.has(i))

export const subscribeToStateAndFetchBatches = ({
  state,
  instance,
}: StoreContext<ProjectionStoreState>): Subscription => {
  const documentProjections$ = state.observable.pipe(
    map((s) => s.documentProjections),
    distinctUntilChanged(isEqual),
  )

  const activeDocumentIds$ = state.observable.pipe(
    map(({subscriptions}) => new Set(Object.keys(subscriptions))),
    distinctUntilChanged(isSetEqual),
  )

  const pendingUpdateSubscription = activeDocumentIds$
    .pipe(
      debounceTime(BATCH_DEBOUNCE_TIME),
      startWith(new Set<string>()),
      pairwise(),
      tap(([prevIds, currIds]) => {
        const newIds = [...currIds].filter((id) => !prevIds.has(id))
        if (newIds.length === 0) return

        state.set('updatingPending', (prev) => {
          const nextValues = {...prev.values}
          for (const id of newIds) {
            const projectionsForDoc = prev.documentProjections[id]
            if (!projectionsForDoc) continue

            const currentValuesForDoc = prev.values[id] ?? {}
            const updatedValuesForDoc = {...currentValuesForDoc}

            for (const hash in projectionsForDoc) {
              const currentValue = updatedValuesForDoc[hash]
              updatedValuesForDoc[hash] = {
                data: currentValue?.data ?? null,
                isPending: true,
              }
            }
            nextValues[id] = updatedValuesForDoc
          }
          return {values: nextValues}
        })
      }),
    )
    .subscribe()

  const queryTrigger$ = combineLatest([activeDocumentIds$, documentProjections$]).pipe(
    debounceTime(BATCH_DEBOUNCE_TIME),
    distinctUntilChanged(isEqual),
  )

  const queryExecutionSubscription = queryTrigger$
    .pipe(
      switchMap(([ids, documentProjections]) => {
        if (!ids.size) return EMPTY
        const {query, params} = createProjectionQuery(ids, documentProjections)
        const controller = new AbortController()

        return new Observable<ProjectionQueryResult[]>((observer) => {
          const {getCurrent, observable} = getQueryState<ProjectionQueryResult[]>(instance, {
            query,
            params,
            tag: PROJECTION_TAG,
            perspective: PROJECTION_PERSPECTIVE,
          })

          const source$ = defer(() => {
            if (getCurrent() === undefined) {
              return from(
                resolveQuery<ProjectionQueryResult[]>(instance, {
                  query,
                  params,
                  tag: PROJECTION_TAG,
                  perspective: PROJECTION_PERSPECTIVE,
                  signal: controller.signal,
                }),
              ).pipe(switchMap(() => observable))
            }
            return observable
          }).pipe(filter((result): result is ProjectionQueryResult[] => result !== undefined))

          const subscription = source$.subscribe(observer)

          return () => {
            if (!controller.signal.aborted) {
              controller.abort()
            }
            subscription.unsubscribe()
          }
        }).pipe(map((data) => ({data, ids})))
      }),
      map(({ids, data}) =>
        processProjectionQuery({
          projectId: instance.config.projectId!,
          dataset: instance.config.dataset!,
          ids,
          results: data,
        }),
      ),
    )
    .subscribe({
      next: (processedValues) => {
        state.set('updateResult', (prev) => {
          const nextValues = {...prev.values}
          for (const docId in processedValues) {
            if (processedValues[docId]) {
              nextValues[docId] = {
                ...(prev.values[docId] ?? {}),
                ...processedValues[docId],
              }
            }
          }
          return {values: nextValues}
        })
      },
      error: (err) => {
        // eslint-disable-next-line no-console
        console.error('Error fetching projection batches:', err)
        // TODO: Potentially update state to reflect error state for affected projections?
      },
    })

  return new Subscription(() => {
    pendingUpdateSubscription.unsubscribe()
    queryExecutionSubscription.unsubscribe()
  })
}
