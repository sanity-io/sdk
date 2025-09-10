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
import {getActiveReleasesState} from '../releases/releasesStore'
import {type StoreContext} from '../store/defineStore'
import {getPublishedId} from '../utils/ids'
import {
  createProjectionQuery,
  createProjectionStatusQuery,
  processProjectionQuery,
  type ProjectionQueryResult,
  type ProjectionStatusQueryResult,
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

  // React to both document projection changes and active releases changes
  const activeReleases$ = getActiveReleasesState(instance).observable
  const queryExecutionSubscription = combineLatest([queryTrigger$, activeReleases$])
    .pipe(
      switchMap(([[ids, documentProjections], releases]) => {
        if (!ids.size) return EMPTY
        const {query, params} = createProjectionQuery(ids, documentProjections)
        // Build version IDs from active releases, independent of current perspective
        const releaseNames = (releases ?? []).map((r) => r.name)
        const status = createProjectionStatusQuery(ids, releaseNames)
        const controller = new AbortController()

        return new Observable<ProjectionQueryResult[]>((observer) => {
          // Main data query runs with effective perspective for this store instance
          const perspective = state.get().perspective
          const {getCurrent, observable} = getQueryState<ProjectionQueryResult[]>(instance, {
            query,
            params,
            tag: PROJECTION_TAG,
            perspective,
          })

          const source$ = defer(() => {
            if (getCurrent() === undefined) {
              return from(
                resolveQuery<ProjectionQueryResult[]>(instance, {
                  query,
                  params,
                  tag: PROJECTION_TAG,
                  perspective: perspective,
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
        }).pipe(
          // Combine with status meta fetched under raw perspective
          switchMap((data) => {
            const statusSource = getQueryState<ProjectionStatusQueryResult>(instance, {
              query: status.query,
              params: status.params,
              tag: PROJECTION_TAG,
              perspective: PROJECTION_PERSPECTIVE,
            })

            const resolved$ = defer(() => {
              if (statusSource.getCurrent() === undefined) {
                return from(
                  resolveQuery<ProjectionStatusQueryResult>(instance, {
                    query: status.query,
                    params: status.params,
                    tag: PROJECTION_TAG,
                    perspective: PROJECTION_PERSPECTIVE,
                    signal: new AbortController().signal,
                  }),
                )
              }
              return statusSource.observable
            })

            return resolved$.pipe(map((statusResult) => ({data, ids, statusResult})))
          }),
        )
      }),
      // Merge status timestamps into results
      map(({ids, data, statusResult}) => {
        const grouped = processProjectionQuery({
          projectId: instance.config.projectId!,
          dataset: instance.config.dataset!,
          ids,
          results: data,
        })
        // Build quick lookup maps for status
        const publishedMap = new Map<string, string>()
        const draftsMap = new Map<string, string>()
        for (const p of statusResult?.published ?? [])
          publishedMap.set(getPublishedId(p._id), p._updatedAt)
        for (const d of statusResult?.drafts ?? [])
          draftsMap.set(getPublishedId(d._id), d._updatedAt)
        // Versions: _id = versions.<release>.<baseId>; parse baseId from id
        const versionsMap = new Map<string, {versionId: string; updatedAt: string}[]>()
        for (const v of statusResult?.versions ?? []) {
          const parts = v._id.split('.')
          const baseId = parts.slice(2).join('.')
          const normalizedBaseId = getPublishedId(baseId)
          const arr = versionsMap.get(normalizedBaseId) ?? []
          arr.push({versionId: v._id, updatedAt: v._updatedAt})
          versionsMap.set(normalizedBaseId, arr)
        }

        // Inject status into each projection entry
        for (const originalId in grouped) {
          const projectionsForDoc = grouped[originalId]
          if (!projectionsForDoc) continue
          const lastEditedPublishedAt = publishedMap.get(originalId)
          const lastEditedDraftAt = draftsMap.get(originalId)
          for (const hash in projectionsForDoc) {
            const curr = projectionsForDoc[hash]
            const _status = {
              ...(lastEditedDraftAt && {lastEditedDraftAt}),
              ...(lastEditedPublishedAt && {lastEditedPublishedAt}),
              ...(versionsMap.get(originalId) && {
                versions: versionsMap
                  .get(originalId)!
                  .reduce<Record<string, {updatedAt: string}>>((acc, v) => {
                    acc[v.versionId] = {updatedAt: v.updatedAt}
                    return acc
                  }, {}),
              }),
            }
            if (curr?.data) {
              curr.data = {...(curr.data as object), _status}
            }
          }
        }
        return grouped
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
      },
    })

  return new Subscription(() => {
    pendingUpdateSubscription.unsubscribe()
    queryExecutionSubscription.unsubscribe()
  })
}
