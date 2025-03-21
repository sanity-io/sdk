import {omit} from 'lodash-es'
import {asapScheduler, EMPTY, firstValueFrom, from, Observable} from 'rxjs'
import {
  catchError,
  delay,
  filter,
  first,
  groupBy,
  map,
  mergeMap,
  pairwise,
  startWith,
  switchMap,
  tap,
} from 'rxjs/operators'

import {bindActionGlobally, type BoundStoreAction} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {defineStore, type StoreContext} from '../store/defineStore'
import {insecureRandomId} from '../utils/ids'

interface CreateFetcherStoreOptions<TParams extends unknown[], TData> {
  /**
   * A unique name for this store (for devtools)
   */
  name: string
  /**
   * A function that creates the observable that will be used to fetch the data.
   */
  fetcher: (instance: SanityInstance) => (...params: TParams) => Observable<TData>
  /**
   * The function used to convert the params into keys that state related to
   * those params will be stored.
   */
  getKey: (instance: SanityInstance, ...params: TParams) => string
  /**
   * Delay in ms before clearing state after the last subscription is removed.
   * This results in react components suspending again due to no previous state
   * to show.
   */
  stateExpirationDelay?: number
  /**
   * The minimum time (ms) that must elapse since the last fetch for the same key
   */
  fetchThrottleInternal?: number
}

interface StoreEntry<TParams extends unknown[], TData> {
  params: TParams
  instance: SanityInstance
  key: string
  data?: TData
  error?: unknown
  subscriptions: string[]
  lastFetchInitiatedAt?: string
}

/**
 * Internal helper type
 * @public
 */
export interface FetcherStoreState<TParams extends unknown[], TData> {
  stateByParams: {[TSerializedKey in string]?: StoreEntry<TParams, TData>}
  error?: unknown
}

/**
 * Internal helper type
 * @public
 */
export interface FetcherStore<TParams extends unknown[], TData> {
  getState: BoundStoreAction<
    FetcherStoreState<TParams, TData>,
    TParams,
    StateSource<TData | undefined>
  >
  resolveState: BoundStoreAction<FetcherStoreState<TParams, TData>, TParams, Promise<TData>>
}

/**
 * Creates a store from a function that returns an observable that fetches data
 * that supports parameterized state caching.
 *
 * This function creates a resource store keyed by parameter values (using the
 * provided `getKey` function) and returns a state source (via `getState`)
 * that components can subscribe to. When a new subscription is added, and if
 * enough time has passed since the last fetch (controlled by
 * `fetchThrottleInternal`), it invokes the observable factory (via
 * `getObservable`) to fetch fresh data. The data is stored in state and can be
 * accessed reactively.
 *
 * Additionally, the store provides a `resolveState` function that returns a
 * Promise resolving with the next non-undefined value from the state source.
 *
 * State expiration is implemented: after the last subscription for a key is
 * removed, its state is cleared after `stateExpirationDelay` ms, causing
 * components to suspend until fresh data is fetched.
 */
export function createFetcherStore<TParams extends unknown[], TData>({
  name,
  fetcher: getObservable,
  getKey,
  fetchThrottleInternal = 1000,
  stateExpirationDelay = 5000,
}: CreateFetcherStoreOptions<TParams, TData>): FetcherStore<TParams, TData> {
  const store = defineStore<FetcherStoreState<TParams, TData>>({
    name,
    getInitialState: () => ({
      stateByParams: {},
    }),
    initialize: (context) => {
      const subscription = subscribeToSubscriptionsAndFetch(context)
      return () => subscription.unsubscribe()
    },
  })

  /**
   * For each key in state.stateByParams we set up a grouped stream.
   * When a subscription is added (i.e. the subscriptions array length increases)
   * and if enough time has elapsed since the last fetch, we update the timestamp
   * and call the factory function for that key.
   */
  const subscribeToSubscriptionsAndFetch = ({
    state,
  }: StoreContext<FetcherStoreState<TParams, TData>>) => {
    return state.observable
      .pipe(
        // Map the state to an array of [serialized, entry] pairs.
        switchMap((s: FetcherStoreState<TParams, TData>) => {
          const entries = Object.entries(s.stateByParams)
          return entries.length > 0 ? from(entries) : EMPTY
        }),
        // Group by the serialized key.
        groupBy(([key]) => key),
        mergeMap((group$) =>
          group$.pipe(
            // Emit an initial value for pairwise comparisons.
            startWith<[string, StoreEntry<TParams, TData> | undefined]>([group$.key, undefined]),
            pairwise(),
            // Trigger only when the subscriptions array grows.
            filter(([[, prevEntry], [, currEntry]]) => {
              const prevSubs = prevEntry?.subscriptions ?? []
              const currSubs = currEntry?.subscriptions ?? []
              return currSubs.length > prevSubs.length
            }),
            map(([, [, currEntry]]) => currEntry),

            // Only trigger if we haven't fetched recently.
            filter((entry) => {
              const lastFetch = entry?.lastFetchInitiatedAt
              if (!lastFetch) return true
              return Date.now() - new Date(lastFetch).getTime() >= fetchThrottleInternal
            }),
            switchMap((entry) => {
              // Retrieve params from the entry
              if (!entry) return EMPTY

              // Record that a fetch is being initiated.
              state.set('setLastFetchInitiatedAt', (prev: FetcherStoreState<TParams, TData>) => ({
                stateByParams: {
                  ...prev.stateByParams,
                  [entry.key]: {
                    ...entry,
                    ...prev.stateByParams[entry.key],
                    lastFetchInitiatedAt: new Date().toISOString(),
                  },
                },
              }))

              const factoryFn = getObservable(entry.instance)
              return factoryFn(...entry.params).pipe(
                // the `createStateSourceAction` util requires the update
                // to
                delay(0, asapScheduler),
                tap((data: TData) =>
                  state.set('setData', (prev: FetcherStoreState<TParams, TData>) => ({
                    stateByParams: {
                      ...prev.stateByParams,
                      [entry.key]: {
                        ...omit(entry, 'error'),
                        ...omit(prev.stateByParams[entry.key], 'error'),
                        data,
                      },
                    },
                  })),
                ),
                catchError((error) => {
                  state.set('setError', (prev) => ({
                    stateByParams: {
                      ...prev.stateByParams,
                      [entry.key]: {
                        ...entry,
                        ...prev.stateByParams[entry.key],
                        error,
                      },
                    },
                  }))

                  return EMPTY
                }),
              )
            }),
          ),
        ),
      )
      .subscribe({
        error: (error) => state.set('setError', {error}),
      })
  }

  const getState = bindActionGlobally(
    store,
    createStateSourceAction({
      selector: (
        {
          instance,
          state: {stateByParams, error},
        }: SelectorContext<FetcherStoreState<TParams, TData>>,
        ...params: TParams
      ) => {
        if (error) throw error
        const key = getKey(instance, ...params)
        const entry = stateByParams[key]
        if (entry?.error) throw entry.error
        return entry?.data
      },
      onSubscribe: ({instance, state}, ...params: TParams) => {
        const subscriptionId = insecureRandomId()
        const key = getKey(instance, ...params)

        state.set('addSubscription', (prev: FetcherStoreState<TParams, TData>) => ({
          stateByParams: {
            ...prev.stateByParams,
            [key]: {
              ...prev.stateByParams[key],
              instance,
              key,
              params: prev.stateByParams[key]?.params || params,
              subscriptions: [...(prev.stateByParams[key]?.subscriptions || []), subscriptionId],
            },
          },
        }))

        return () => {
          setTimeout(() => {
            state.set('removeSubscription', (prev: FetcherStoreState<TParams, TData>) => {
              const entry = prev.stateByParams[key]
              if (!entry) return prev

              const newSubs = (entry.subscriptions || []).filter((id) => id !== subscriptionId)
              if (newSubs.length === 0) {
                return {stateByParams: omit(prev.stateByParams, key)}
              }

              return {
                stateByParams: {
                  ...prev.stateByParams,
                  [key]: {
                    ...entry,
                    subscriptions: newSubs,
                  },
                },
              }
            })
          }, stateExpirationDelay)
        }
      },
    }),
  )

  const resolveState = bindActionGlobally(store, ({instance}, ...params: TParams) =>
    firstValueFrom(getState(instance, ...params).observable.pipe(first((i) => i !== undefined))),
  )

  return {getState, resolveState}
}
