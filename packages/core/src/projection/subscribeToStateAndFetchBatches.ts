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
import {type BoundPerspectiveKey} from '../store/createActionBinder'
import {type StoreContext} from '../store/defineStore'
import {
  createProjectionQuery,
  processProjectionQuery,
  type ProjectionQueryResult,
} from './projectionQuery'
import {buildStatusQueryIds, processStatusQueryResults} from './statusQuery'
import {type ProjectionStoreState} from './types'
import {PROJECTION_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

const isSetEqual = <T>(a: Set<T>, b: Set<T>) =>
  a.size === b.size && Array.from(a).every((i) => b.has(i))

interface StatusQueryResult {
  _id: string
  _updatedAt: string
}

export const subscribeToStateAndFetchBatches = ({
  state,
  instance,
  key: {source, perspective},
}: StoreContext<ProjectionStoreState, BoundPerspectiveKey>): Subscription => {
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

        // Build status query IDs and query
        const statusQueryIds = buildStatusQueryIds(ids, perspective)
        const statusQuery = `*[_id in $statusIds]{_id, _updatedAt}`
        const statusParams = {statusIds: statusQueryIds}

        const projectionQuery$ = new Observable<ProjectionQueryResult[]>((observer) => {
          const {getCurrent, observable} = getQueryState<ProjectionQueryResult[]>(instance, {
            ...{
              query,
              params,
              tag: PROJECTION_TAG,
              perspective,
            },
            source,
          })

          const querySource$ = defer(() => {
            if (getCurrent() === undefined) {
              return from(
                resolveQuery<ProjectionQueryResult[]>(instance, {
                  ...{
                    query,
                    params,
                    tag: PROJECTION_TAG,
                    signal: controller.signal,
                    perspective,
                  },
                  source,
                }),
              ).pipe(switchMap(() => observable))
            }
            return observable
          }).pipe(filter((result): result is ProjectionQueryResult[] => result !== undefined))

          const subscription = querySource$.subscribe(observer)

          return () => {
            if (!controller.signal.aborted) {
              controller.abort()
            }
            subscription.unsubscribe()
          }
        })

        const statusQuery$ = new Observable<StatusQueryResult[]>((observer) => {
          const {getCurrent, observable} = getQueryState<StatusQueryResult[]>(instance, {
            ...{
              query: statusQuery,
              params: statusParams,
              tag: PROJECTION_TAG,
              perspective: 'raw',
            },
            source,
          })

          const statusQuerySource$ = defer(() => {
            if (getCurrent() === undefined) {
              return from(
                resolveQuery<StatusQueryResult[]>(instance, {
                  ...{
                    query: statusQuery,
                    params: statusParams,
                    tag: PROJECTION_TAG,
                    signal: controller.signal,
                    perspective: 'raw',
                  },
                  source,
                }),
              ).pipe(switchMap(() => observable))
            }
            return observable
          }).pipe(filter((result): result is StatusQueryResult[] => result !== undefined))

          const subscription = statusQuerySource$.subscribe(observer)

          return () => {
            subscription.unsubscribe()
          }
        })

        // Combine both streams: emit whenever either has a new value (after both have
        // emitted at least one defined value). This keeps reacting to query store updates.
        return combineLatest([projectionQuery$, statusQuery$]).pipe(
          filter(
            (pair): pair is [ProjectionQueryResult[], StatusQueryResult[]] =>
              pair[0] !== undefined && pair[1] !== undefined,
          ),
          map(([projection, status]) => ({
            data: projection,
            ids,
            statusResults: status,
          })),
        )
      }),
      map(({ids, data, statusResults}) => {
        // Process status results into documentStatuses (same shape as _status returned to users)
        const documentStatuses = processStatusQueryResults(statusResults)
        state.set('updateStatuses', (prev) => ({
          documentStatuses: {
            ...prev.documentStatuses,
            ...documentStatuses,
          },
        }))

        // Assemble projection values with _status (buildStatusForDocument in statusQuery)
        const currentState = state.get()
        return processProjectionQuery({
          ids,
          results: data,
          documentStatuses: currentState.documentStatuses,
          perspective: perspective,
        })
      }),
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
