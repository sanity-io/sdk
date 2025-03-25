import {type ResponseQueryOptions} from '@sanity/client'
import {
  catchError,
  combineLatest,
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
  pairwise,
  race,
  share,
  startWith,
  switchMap,
  tap,
} from 'rxjs'

import {getClientState} from '../client/clientStore'
import {type DatasetHandle} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {type StoreState} from '../store/createStoreState'
import {defineStore, type StoreContext} from '../store/defineStore'
import {insecureRandomId} from '../utils/ids'
import {QUERY_STATE_CLEAR_DELAY, QUERY_STORE_API_VERSION} from './queryStoreConstants'
import {
  addSubscriber,
  cancelQuery,
  initializeQuery,
  type QueryStoreState,
  removeSubscriber,
  setLastLiveEventId,
  setQueryData,
  setQueryError,
} from './reducers'

/**
 * @beta
 */
export interface QueryOptions
  extends Pick<
      ResponseQueryOptions,
      'perspective' | 'useCdn' | 'cache' | 'next' | 'cacheMode' | 'tag'
    >,
    DatasetHandle {
  params?: Record<string, unknown>
}

/**
 * @beta
 */
export interface ResolveQueryOptions extends QueryOptions {
  signal?: AbortSignal
}

const EMPTY_ARRAY: never[] = []

/** @beta */
export const getQueryKey = (query: string, options: QueryOptions = {}): string =>
  JSON.stringify({query, options})
/** @beta */
export const parseQueryKey = (key: string): {query: string; options: QueryOptions} =>
  JSON.parse(key)

const queryStore = defineStore<QueryStoreState>({
  name: 'QueryStore',
  getInitialState: () => ({queries: {}}),
  initialize(context) {
    const subscriptions = [
      listenForNewSubscribersAndFetch(context),
      listenToLiveClientAndSetLastLiveEventIds(context),
    ]

    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe()
      }
    }
  },
})

const errorHandler = (state: StoreState<{error?: unknown}>) => {
  return (error: unknown): void => state.set('setError', {error})
}

const listenForNewSubscribersAndFetch = ({state, instance}: StoreContext<QueryStoreState>) => {
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

            const lastLiveEventId$ = state.observable.pipe(
              map((s) => s.queries[group$.key]?.lastLiveEventId),
              distinctUntilChanged(),
            )
            const {query, options: {params, projectId, dataset, tag, ...options} = {}} =
              parseQueryKey(group$.key)
            const client$ = getClientState(instance, {
              apiVersion: QUERY_STORE_API_VERSION,
              projectId,
              dataset,
            }).observable

            return combineLatest([lastLiveEventId$, client$]).pipe(
              switchMap(([lastLiveEventId, client]) =>
                client.observable.fetch(query, params, {
                  ...options,
                  filterResponse: false,
                  returnQuery: false,
                  lastLiveEventId,
                  tag,
                }),
              ),
            )
          }),
          catchError((error) => {
            state.set('setQueryError', setQueryError(group$.key, error))
            return EMPTY
          }),
          tap(({result, syncTags}) => {
            state.set('setQueryData', setQueryData(group$.key, result, syncTags))
          }),
        ),
      ),
    )
    .subscribe({error: errorHandler(state)})
}

const listenToLiveClientAndSetLastLiveEventIds = ({
  state,
  instance,
}: StoreContext<QueryStoreState>) => {
  const liveMessages$ = getClientState(instance, {
    apiVersion: QUERY_STORE_API_VERSION,
  }).observable.pipe(
    switchMap((client) =>
      client.live.events({includeDrafts: !!client.config().token, tag: 'query-store'}),
    ),
    share(),
    filter((e) => e.type === 'message'),
  )

  return state.observable
    .pipe(
      mergeMap((s) => Object.entries(s.queries)),
      groupBy(([key]) => key),
      mergeMap((group$) => {
        const syncTags$ = group$.pipe(
          map(([, queryState]) => queryState),
          map((i) => i?.syncTags ?? EMPTY_ARRAY),
          distinctUntilChanged(),
        )

        return combineLatest([liveMessages$, syncTags$]).pipe(
          filter(([message, syncTags]) => message.tags.some((tag) => syncTags.includes(tag))),
          tap(([message]) => {
            state.set('setLastLiveEventId', setLastLiveEventId(group$.key, message.id))
          }),
        )
      }),
    )
    .subscribe({error: errorHandler(state)})
}

/**
 * Returns the state source for a query.
 *
 * This function returns a state source that represents the current result of a GROQ query.
 * Subscribing to the state source will instruct the SDK to fetch the query (if not already fetched)
 * and will keep the query live using the Live content API (considering sync tags) to provide up-to-date results.
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
export function getQueryState<T>(
  instance: SanityInstance,
  query: string,
  options?: QueryOptions,
): StateSource<T | undefined>
/** @beta */
export function getQueryState(
  instance: SanityInstance,
  query: string,
  options?: QueryOptions,
): StateSource<unknown>
/** @beta */
export function getQueryState(...args: Parameters<typeof _getQueryState>): StateSource<unknown> {
  return _getQueryState(...args)
}
const _getQueryState = bindActionByDataset(
  queryStore,
  createStateSourceAction({
    selector: (
      {state}: SelectorContext<QueryStoreState>,
      query: string,
      options?: QueryOptions,
    ) => {
      if (state.error) throw state.error
      const key = getQueryKey(query, options)
      const queryState = state.queries[key]
      if (queryState?.error) throw queryState.error
      return queryState?.result
    },
    onSubscribe: ({state}, query, options?: QueryOptions) => {
      const subscriptionId = insecureRandomId()
      const key = getQueryKey(query, options)

      state.set('addSubscriber', addSubscriber(key, subscriptionId))

      return () => {
        // this runs on unsubscribe
        setTimeout(
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
 * Unlike `getQueryState`, which registers subscribers to keep the query live and performs automatic cleanup,
 * `resolveQuery` does not track subscribers. This makes it ideal for use with React Suspense, where the returned
 * promise is thrown to delay rendering until the query result becomes available.
 * Once the promise resolves, it is expected that a real subscriber will be added via `getQueryState` to manage ongoing updates.
 *
 * Additionally, an optional AbortSignal can be provided to cancel the query and immediately clear the associated state
 * if there are no active subscribers.
 *
 * @beta
 */
export function resolveQuery<T>(
  instance: SanityInstance,
  query: string,
  options?: ResolveQueryOptions,
): Promise<T>
/** @beta */
export function resolveQuery(
  instance: SanityInstance,
  query: string,
  options?: ResolveQueryOptions,
): Promise<unknown>
/** @beta */
export function resolveQuery(...args: Parameters<typeof _resolveQuery>): Promise<unknown> {
  return _resolveQuery(...args)
}
const _resolveQuery = bindActionByDataset(
  queryStore,
  ({state, instance}, query: string, {signal, ...options}: ResolveQueryOptions = {}) => {
    const {getCurrent} = getQueryState(instance, query, options)
    const key = getQueryKey(query, options)

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
              state.set('cancelQuery', cancelQuery(key))
            }
            throw error
          }),
        )
      : NEVER

    state.set('initializeQuery', initializeQuery(key))

    const resolved$ = state.observable.pipe(
      map(getCurrent),
      first((i) => i !== undefined),
    )

    return firstValueFrom(race([resolved$, aborted$]))
  },
)
