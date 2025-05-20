import {type DocumentId} from '@sanity/id-utils'
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

import {type DatasetHandle} from '../config/sanityConfig'
import {getQueryState, resolveQuery} from '../query/queryStore'
import {type StoreContext} from '../store/defineStore'
import {
  createProjectionQuery,
  processProjectionQuery,
  type ProjectionQueryResult,
} from './projectionQuery'
import {type DocumentConfigs, type DocumentProjections, type ProjectionStoreState} from './types'
import {PROJECTION_PERSPECTIVE, PROJECTION_TAG} from './util'

const BATCH_DEBOUNCE_TIME = 50

const isSetEqual = <T>(a: Set<T>, b: Set<T>) =>
  a.size === b.size && Array.from(a).every((i) => b.has(i))

export const subscribeToStateAndFetchBatches = ({
  state,
  instance,
}: StoreContext<ProjectionStoreState>): Subscription => {
  const activeDocumentIds$ = state.observable.pipe(
    map(({subscriptions}) => new Set(Object.keys(subscriptions))),
    distinctUntilChanged(isSetEqual),
  )

  const documentProjections$: Observable<Record<DocumentId, DocumentProjections>> =
    state.observable.pipe(
      map((s) => s.documentProjections),
      distinctUntilChanged(isEqual),
    )

  const projectionConfig$: Observable<Record<DocumentId, DocumentConfigs>> = state.observable.pipe(
    map(({configs}) => configs),
    distinctUntilChanged(isEqual),
  )

  // set document IDs that have changed to a pending state
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

  const queryTrigger$ = combineLatest([
    activeDocumentIds$,
    documentProjections$,
    projectionConfig$,
  ]).pipe(debounceTime(BATCH_DEBOUNCE_TIME), distinctUntilChanged(isEqual))

  const queryExecutionSubscription = queryTrigger$
    .pipe(
      switchMap(([ids, documentProjections, projectionConfigs]) => {
        if (!ids.size) return EMPTY

        // Group documents by project/dataset
        const groupedDocs = Array.from(ids).reduce<
          Map<
            string,
            {
              datasetHandle: DatasetHandle
              ids: Set<DocumentId>
              documentProjections: Record<DocumentId, DocumentProjections>
              projectionConfigs: Record<DocumentId, DocumentConfigs>
            }
          >
        >((acc, id) => {
          const configsForDoc: DocumentConfigs = projectionConfigs[id as DocumentId]
          if (!configsForDoc) return acc

          // Group by project/dataset combination
          Object.entries(configsForDoc).forEach(([hash, config]) => {
            const datasetHandle: DatasetHandle = {
              projectId: config.projectId,
              dataset: config.dataset,
            }
            const key = `${datasetHandle.projectId ?? ''}.${datasetHandle.dataset ?? ''}`

            if (!acc.has(key)) {
              acc.set(key, {
                datasetHandle,
                ids: new Set(),
                documentProjections: {},
                projectionConfigs: {},
              })
            }
            const group = acc.get(key)!
            group.ids.add(id as DocumentId)
            group.documentProjections[id as DocumentId] =
              documentProjections[id as DocumentId] || {}
            group.projectionConfigs[id as DocumentId] = {[hash]: config as DatasetHandle}
          })
          return acc
        }, new Map())

        // Create and execute queries for each group
        return new Observable<{data: ProjectionQueryResult[]; ids: Set<DocumentId>}>((observer) => {
          const controllers: AbortController[] = []
          const subscriptions: Subscription[] = []

          groupedDocs.forEach((group) => {
            const {query, params} = createProjectionQuery(
              group.ids,
              group.documentProjections,
              group.projectionConfigs,
            )
            const controller = new AbortController()
            controllers.push(controller)

            const {getCurrent, observable} = getQueryState<ProjectionQueryResult[]>(instance, {
              query,
              params,
              tag: PROJECTION_TAG,
              perspective: PROJECTION_PERSPECTIVE,
              ...(group.datasetHandle.projectId ? {projectId: group.datasetHandle.projectId} : {}),
              ...(group.datasetHandle.dataset ? {dataset: group.datasetHandle.dataset} : {}),
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
                    ...(group.datasetHandle.projectId
                      ? {projectId: group.datasetHandle.projectId}
                      : {}),
                    ...(group.datasetHandle.dataset ? {dataset: group.datasetHandle.dataset} : {}),
                  }),
                ).pipe(switchMap(() => observable))
              }
              return observable
            }).pipe(filter((result): result is ProjectionQueryResult[] => result !== undefined))

            const subscription = source$.subscribe({
              next: (data) => observer.next({data, ids: group.ids}),
              error: (err) => observer.error(err),
            })
            subscriptions.push(subscription)
          })

          return () => {
            controllers.forEach((controller) => {
              if (!controller.signal.aborted) {
                controller.abort()
              }
            })
            subscriptions.forEach((subscription) => subscription.unsubscribe())
          }
        })
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
