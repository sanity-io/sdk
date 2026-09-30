import {type ResponseQueryOptions} from '@sanity/client'
import {
  catchError,
  combineLatest,
  defer,
  distinctUntilChanged,
  EMPTY,
  filter,
  first,
  firstValueFrom,
  groupBy,
  map,
  mergeMap,
  NEVER,
  Observable,
  of,
  pairwise,
  race,
  startWith,
  Subscription,
  switchMap,
  tap,
} from 'rxjs'
import {exhaustMapWithTrailing} from 'rxjs-exhaustmap-with-trailing'

import {getClientState} from '../client/clientStore'
import {observeQueryChanges} from '../client/observeQueryChanges'
import {type DatasetHandle, isDatasetResource} from '../config/sanityConfig'
import {getPerspectiveState} from '../releases/getPerspectiveState'
import {isReleasePerspective} from '../releases/utils/isReleasePerspective'
import {bindActionByResource, type BoundResourceKey} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {type StoreState} from '../store/createStoreState'
import {defineStore, type StoreContext} from '../store/defineStore'
import {type ResolveQueryResult} from '../typegen/resolve'
import {randomId} from '../utils/ids'
import {setCleanupTimeout} from '../utils/setCleanupTimeout'
import {
  QUERY_STATE_CLEAR_DELAY,
  QUERY_STORE_API_VERSION,
  QUERY_STORE_DEFAULT_PERSPECTIVE,
} from './queryStoreConstants'
import {
  addSubscriber,
  type QueryStoreState,
  removeSubscriber,
  setQueryData,
  setQueryError,
} from './reducers'

/**
 * @beta
 */
export interface QueryOptions<
  TQuery extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>
  extends
    Pick<ResponseQueryOptions, 'cache' | 'next' | 'cacheMode' | 'tag'>,
    DatasetHandle<TDataset, TProjectId> {
  /**
   * Retained for compatibility. SDK queries always bypass the CDN because listener
   * notifications cannot invalidate cached query responses.
   * @deprecated SDK queries always bypass the CDN.
   */
  useCdn?: boolean
  query: TQuery
  params?: Record<string, unknown>
}

/**
 * @beta
 */
export interface ResolveQueryOptions<
  TQuery extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends QueryOptions<TQuery, TDataset, TProjectId> {
  signal?: AbortSignal
}

/** @internal */
export const getQueryKey = (instance: SanityInstance, options: QueryOptions): string =>
  JSON.stringify(normalizeQueryOptions(instance, options))
/** @internal */
export const parseQueryKey = (key: string): QueryOptions => JSON.parse(key)

/** Normalize the query target before binding its store and building its cache key. */
function normalizeQueryOptions(instance: SanityInstance, options: QueryOptions): QueryOptions {
  const {useCdn: _useCdn, projectId, dataset, ...rest} = options
  const hasDatasetOverride = projectId !== undefined || dataset !== undefined
  const resource =
    rest.resource ??
    (hasDatasetOverride
      ? resolveDatasetOverride(instance, {projectId, dataset})
      : instance.config.resource)
  return {
    ...rest,
    ...(resource && {resource}),
    perspective: rest.perspective ?? instance.config.perspective ?? QUERY_STORE_DEFAULT_PERSPECTIVE,
  }
}

function resolveDatasetOverride(
  instance: SanityInstance,
  {projectId, dataset}: Pick<QueryOptions, 'projectId' | 'dataset'>,
) {
  const resource = instance.config.resource
  const fallback = resource && isDatasetResource(resource) ? resource : instance.config
  const targetProject = projectId ?? fallback.projectId
  const targetDataset = dataset ?? fallback.dataset
  if (!targetProject || !targetDataset) {
    throw new Error('Query dataset overrides require both a projectId and dataset.')
  }
  return {projectId: targetProject, dataset: targetDataset}
}

const queryStore = defineStore<QueryStoreState, BoundResourceKey>({
  name: 'QueryStore',
  getInitialState: () => ({queries: {}}),
  initialize(context) {
    const subscription = listenForNewSubscribersAndFetch(context)
    return () => subscription.unsubscribe()
  },
  upstream: (context) => listenForQueryChanges(context),
})

const errorHandler = (state: StoreState<{error?: unknown}>) => {
  return (error: unknown): void => state.set('setError', {error})
}

const listenForNewSubscribersAndFetch = ({
  state,
  instance,
}: StoreContext<QueryStoreState, BoundResourceKey>) => {
  return state.observable
    .pipe(
      map((s) => new Set(Object.keys(s.queries))),
      distinctUntilChanged((curr, next) => {
        if (curr.size !== next.size) return false
        return Array.from(next).every((i) => curr.has(i))
      }),
      startWith(new Set<string>()),
      pairwise(),
      mergeMap(([curr, next]) => {
        const added = Array.from(next).filter((i) => !curr.has(i))
        const removed = Array.from(curr).filter((i) => !next.has(i))

        return [
          ...added.map((key) => ({key, added: true})),
          ...removed.map((key) => ({key, added: false})),
        ]
      }),
      groupBy((i) => i.key),
      mergeMap((group$) =>
        group$.pipe(
          switchMap((e) => {
            if (!e.added) return EMPTY

            const changes$ = state.observable.pipe(
              map((s) => s.refreshVersion ?? 0),
              distinctUntilChanged(),
            )
            const {
              query,
              params,
              tag,
              resource,
              perspective: perspectiveFromOptions,
              ...restOptions
            } = parseQueryKey(group$.key)

            // Short-circuit perspective resolution for non-release perspectives to avoid
            // touching the releases store (and its initialization) unnecessarily.
            const perspective$ = isReleasePerspective(perspectiveFromOptions)
              ? getPerspectiveState(instance, {
                  perspective: perspectiveFromOptions,
                  resource,
                }).observable.pipe(filter(Boolean))
              : of(perspectiveFromOptions ?? QUERY_STORE_DEFAULT_PERSPECTIVE)

            const client$ = getClientState(instance, {
              apiVersion: QUERY_STORE_API_VERSION,
              resource,
            }).observable

            return combineLatest({client: client$, perspective: perspective$}).pipe(
              // Client and perspective changes cancel obsolete requests. Mutation
              // notifications finish the current fetch before one trailing refetch.
              switchMap(({client, perspective}) => {
                let hasCurrentResult = false
                return changes$.pipe(
                  exhaustMapWithTrailing(() =>
                    defer(() =>
                      client.observable.fetch(query, params, {
                        ...restOptions,
                        useCdn: false,
                        perspective,
                        filterResponse: false,
                        returnQuery: false,
                        tag: tag ?? 'query.fetch',
                      }),
                    ).pipe(
                      tap(({result}) => {
                        hasCurrentResult = true
                        state.set('setQueryData', setQueryData(group$.key, result))
                      }),
                      // A failed refresh must not terminate this query's subscription.
                      // Keep results only after this client and perspective fetched successfully.
                      catchError((error: unknown) => {
                        if (!hasCurrentResult) {
                          state.set('setQueryError', setQueryError(group$.key, error))
                        }
                        return EMPTY
                      }),
                    ),
                  ),
                )
              }),
              // Catch inside the per-event stream: erroring the group pipe would
              // complete the group's subscription, and since `groupBy` above never
              // removes its group subjects, re-adding the key would emit into a
              // subject with no subscribers — the key could never be fetched again.
              catchError((error) => {
                state.set('setQueryError', setQueryError(group$.key, error))
                return EMPTY
              }),
            )
          }),
        ),
      ),
    )
    .subscribe({error: errorHandler(state)})
}

const listenForQueryChanges = ({
  state,
  instance,
  key: {resource},
}: StoreContext<QueryStoreState, BoundResourceKey>) => {
  // A stored error must not stop the next mount before it can reopen upstream.
  // Retain it until demand closes, like createStoreInstance's upstream errors.
  const subscription = new Subscription(() => state.set('clearError', {error: undefined}))
  subscription.add(
    getClientState(instance, {apiVersion: QUERY_STORE_API_VERSION, resource})
      .observable.pipe(
        switchMap((client) =>
          observeQueryChanges(client, {tag: 'query.listen'}).pipe(
            tap(() =>
              state.set('invalidateQueries', (prev) => ({
                ...prev,
                error: undefined,
                refreshVersion: (prev.refreshVersion ?? 0) + 1,
              })),
            ),
            // The client reconnects transient failures. Keep observing client changes
            // after a terminal error so refreshed credentials can open a new listener.
            catchError((error: unknown) => {
              state.set('setError', {error})
              return EMPTY
            }),
          ),
        ),
      )
      .subscribe({error: errorHandler(state)}),
  )
  return subscription
}

/**
 * Returns the state source for a query.
 *
 * This function returns a state source that represents the current result of a GROQ query.
 * Subscribing to the state source will instruct the SDK to fetch the query (if not already fetched)
 * and refetch it on dataset mutations through a shared listener. Queries bypass the CDN.
 * Every active query is invalidated, including queries that join changed documents.
 * Listener visibility is best-effort; this does not provide a query consistency cursor.
 * When the last subscriber is removed, the query state is automatically cleaned up from the store.
 *
 * Note: This functionality is for advanced users who want to build their own framework integrations.
 * Our SDK also provides a React integration (useQuery hook) for convenient usage.
 *
 * Note: Automatic cleanup can interfere with React Suspense because if a component suspends while being the only subscriber,
 * cleanup might occur unexpectedly. In such cases, consider using `resolveQuery` instead.
 *
 * @beta
 */
export function getQueryState<
  TQuery extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  queryOptions: QueryOptions<TQuery, TDataset, TProjectId>,
): StateSource<ResolveQueryResult<TQuery, `${TProjectId}.${TDataset}`> | undefined>

/** @beta */
export function getQueryState<TData>(
  instance: SanityInstance,
  queryOptions: QueryOptions,
): StateSource<TData | undefined>

/** @beta */
export function getQueryState(
  instance: SanityInstance,
  queryOptions: QueryOptions,
): StateSource<unknown>

/** @beta */
export function getQueryState(
  ...args: Parameters<typeof _getQueryState>
): ReturnType<typeof _getQueryState> {
  const [instance, options] = args
  return _getQueryState(instance, normalizeQueryOptions(instance, options))
}
const _getQueryState = bindActionByResource(
  queryStore,
  createStateSourceAction({
    selector: ({state, instance}: SelectorContext<QueryStoreState>, options: QueryOptions) => {
      if (state.error) throw state.error
      const key = getQueryKey(instance, options)
      const queryState = state.queries[key]
      if (queryState?.error) throw queryState.error
      return queryState?.result
    },
    onSubscribe: ({state, instance}, options: QueryOptions) => {
      const subscriptionId = randomId(16)
      const key = getQueryKey(instance, options)

      state.set('addSubscriber', addSubscriber(key, subscriptionId))

      return () => {
        // this runs on unsubscribe
        setCleanupTimeout(
          () => state.set('removeSubscriber', removeSubscriber(key, subscriptionId)),
          QUERY_STATE_CLEAR_DELAY,
        )
      }
    },
  }),
)

/**
 * Resolves the result of a query without registering a lasting subscriber.
 *
 * This function fetches the result of a GROQ query and returns a promise that resolves with the query result.
 * It registers a temporary subscriber for the lifetime of the resolution (released shortly after the promise
 * settles), so the query state participates in normal cleanup even when no lasting subscriber ever attaches —
 * e.g. when a suspended component errors before committing. This makes it ideal for use with React Suspense,
 * where the returned promise is thrown to delay rendering until the query result becomes available.
 * Once the promise resolves, it is expected that a real subscriber will be added via `getQueryState` to manage ongoing updates.
 *
 * Additionally, an optional AbortSignal can be provided to cancel the query and immediately clear the associated state
 * if there are no other active subscribers.
 *
 * @beta
 */
export function resolveQuery<
  TQuery extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  queryOptions: ResolveQueryOptions<TQuery, TDataset, TProjectId>,
): Promise<ResolveQueryResult<TQuery, `${TProjectId}.${TDataset}`>>

/** @beta */
export function resolveQuery<TData>(
  instance: SanityInstance,
  queryOptions: ResolveQueryOptions,
): Promise<TData>
/** @beta */
export function resolveQuery(...args: Parameters<typeof _resolveQuery>): Promise<unknown> {
  const [instance, options] = args
  return _resolveQuery(instance, {
    ...normalizeQueryOptions(instance, options),
    signal: options.signal,
  })
}
const _resolveQuery = bindActionByResource(
  queryStore,
  ({state, instance}, {signal, ...options}: ResolveQueryOptions) => {
    const normalized = normalizeQueryOptions(instance, options)
    const {getCurrent} = getQueryState(instance, normalized)
    const key = getQueryKey(instance, normalized)

    // Hold a temporary subscription for the lifetime of this resolution so the
    // key participates in normal cleanup. Without one, a fetch that errors
    // while a component is suspended leaves a subscriber-less key behind — the
    // component never commits, so no other subscriber exists — and its stored
    // error would be rethrown on every future mount without ever refetching.
    const subscriptionId = randomId(16)
    state.set('addSubscriber', addSubscriber(key, subscriptionId))

    const aborted$ = signal
      ? new Observable<void>((observer) => {
          const cleanup = () => {
            signal.removeEventListener('abort', listener)
          }

          const listener = () => {
            observer.error(new DOMException('The operation was aborted.', 'AbortError'))
            observer.complete()
            cleanup()
          }
          signal.addEventListener('abort', listener)

          return cleanup
        }).pipe(
          catchError((error) => {
            if (error instanceof Error && error.name === 'AbortError') {
              // Release immediately (not after the clear delay) so that when
              // this was the only subscriber, the key removal tears down the
              // in-flight request right away — e.g. when useQuery switches
              // to a different query
              state.set('removeSubscriber', removeSubscriber(key, subscriptionId))
            }
            throw error
          }),
        )
      : NEVER

    const resolved$ = state.observable.pipe(
      map(getCurrent),
      first((i) => i !== undefined),
    )

    const promise = firstValueFrom(race([resolved$, aborted$]))
    const releaseSubscriber = () => {
      setCleanupTimeout(() => {
        state.set('removeSubscriber', removeSubscriber(key, subscriptionId))
      }, QUERY_STATE_CLEAR_DELAY)
    }
    promise.then(releaseSubscriber, releaseSubscriber)
    return promise
  },
)
