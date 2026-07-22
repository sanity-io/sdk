import {filter, firstValueFrom, map, type Observable, Subscription} from 'rxjs'

import {setCleanupInterval, setCleanupTimeout} from '../utils/setCleanupTimeout'
import {bindActionGlobally} from './createActionBinder'
import {type SanityInstance} from './createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from './createStateSourceAction'
import {type StoreState} from './createStoreState'
import {defineStore, type StoreContext} from './defineStore'

const DEFAULT_STALE_TIME = 30_000
const DEFAULT_GC_TIME = 300_000

/**
 * Identifies cached data for invalidation, matched across the whole store.
 * A fetcher declares the tags each of its entries carries (via
 * {@link FetcherDefinition.tags}); a mutation declares the tags it invalidates
 * (via {@link MutationDefinition.invalidates}).
 *
 * When invalidating,`{type: 'organization'}` matches every entry carrying any `organization` tag;
 * `{type: 'organization', id: 'abc'}` matches only entries carrying that exact pair.
 * List entries carry a `{type, id: 'LIST'}` sentinel plus one tag per item, so a
 * "create" mutation can refetch lists without touching unrelated detail entries.
 *
 * @internal
 */
export interface CacheTag {
  type: string
  /** Specific id, or the `'LIST'` sentinel for list entries */
  id?: string | number
}

/**
 * The reactive value of one cache entry, as exposed by
 * {@link Fetcher.getState}. React hooks consume this envelope directly.
 * Discriminated on `status`, so narrowing gives correctly-typed `data`:
 * `'success'` is the only arm carrying data, and a background failure while
 * data still renders surfaces on the `'success'` arm's `error`.
 *
 * `isFetching` is common to all arms: a fetch for this entry is in flight
 * (initial load, revalidation, or poll).
 *
 * @internal
 */
export type FetcherSnapshot<TData> =
  | {
      /** No data yet — initial fetch in flight or not started */
      status: 'pending'
      data: undefined
      error: undefined
      isFetching: boolean
      dataUpdatedAt: undefined
    }
  | {
      /** Data available — possibly stale, possibly revalidating */
      status: 'success'
      data: TData
      /** Most recent background-fetch failure, cleared by the next successful fetch */
      error: unknown
      isFetching: boolean
      /** Epoch ms of the fetch that produced `data` */
      dataUpdatedAt: number
    }
  | {
      /** The last fetch failed and no data exists to serve */
      status: 'error'
      data: undefined
      error: unknown
      isFetching: boolean
      dataUpdatedAt: undefined
    }

/**
 * A typed description of one cached, parameterised read of an API response —
 * here is a single cache per {@link SanityInstance}; every definition registers
 * into it and its `name` namespaces its keys. A list and a detail read are two
 * definitions over the one cache, not two caches.
 *
 * Entry lifecycle: fresh → stale → collected. Fresh entries are served from
 * cache with no fetch; stale entries are served immediately and revalidated in
 * the background (stale-while-revalidate); collected entries are removed once
 * their `gcTime` elapses after the last unsubscribe, so the next subscriber
 * suspends.
 *
 * @internal
 */
export interface FetcherDefinition<TParams extends unknown[], TData> {
  /** Namespaces this fetcher's keys in the shared cache; used for devtools and request-tag derivation */
  name: string
  /**
   * Fetches the data once. Return an observable that emits the result and
   * completes.
   */
  fetch: (instance: SanityInstance) => (...params: TParams) => Observable<TData>
  /** Converts params into the cache key that identifies an entry (unique within `name`) */
  getKey: (instance: SanityInstance, ...params: TParams) => string
  /**
   * Cache tags each entry carries, for cache-wide invalidation. A static array,
   * or a function of the fetched data when tags depend on the response (e.g. one
   * tag per list item).
   */
  tags?: CacheTag[] | ((data: TData, ...params: TParams) => CacheTag[])
  /**
   * How long fetched data is fresh, in ms. Fresh entries never refetch;
   * stale entries serve cached data and revalidate in the background.
   * @defaultValue 30_000
   */
  staleTime?: number
  /**
   * How long an entry survives after its last unsubscribe before it is garbage
   * collected, in ms. The clock starts at the last unsubscribe — entries with
   * active subscribers are never collected.
   * @defaultValue 300_000
   */
  gcTime?: number
  /**
   * Refetch on this interval (ms) while the entry has at least one subscriber,
   * independent of staleness. Ticks are skipped while `document.hidden`. Off by default.
   */
  refetchInterval?: number
  /**
   * Consulted once, when an entry is being created and no cached data exists for
   * it. Return data pulled from another fetcher in the same cache — read via its
   * ordinary `getState(instance, ...).getCurrent()`, e.g. a detail entry pulling
   * its item out of the cached list — to skip or soften the initial fetch.
   * `dataUpdatedAt` must be when the source data was fetched, not "now": staleness
   * is measured from it. Return `undefined` to fetch as normal.
   */
  initialData?: (
    instance: SanityInstance,
    ...params: TParams
  ) => {data: TData; dataUpdatedAt: number} | undefined
}

/**
 * A typed handle over the shared fetcher cache, returned by
 * {@link defineFetcher}. It is a view onto the entries under its definition's
 * `name`, not a cache of its own.
 *
 * @internal
 */
export interface Fetcher<TParams extends unknown[], TData> {
  /** Reactive envelope for one entry. Subscribing triggers fetching per staleness rules. */
  getState: (instance: SanityInstance, ...params: TParams) => StateSource<FetcherSnapshot<TData>>
  /**
   * Resolves with the entry's first available data — the promise a suspending
   * component throws. Rejects if the initial fetch fails.
   */
  resolveState: (instance: SanityInstance, ...params: TParams) => Promise<TData>
  /**
   * Marks the entry stale. If it has active subscribers it refetches immediately;
   * otherwise it refetches on next subscribe.
   */
  invalidate: (instance: SanityInstance, ...params: TParams) => void
  /** {@link Fetcher.invalidate} for every entry under this fetcher's `name`. */
  invalidateAll: (instance: SanityInstance) => void
  /**
   * Imperative fetch, bypassing staleness. Dedupes against an in-flight fetch.
   * Resolves with the entry's data as held by the cache once the fetch settles.
   */
  refetch: (instance: SanityInstance, ...params: TParams) => Promise<TData>
  /**
   * Writes an entry's data directly. Returns an undo handle — inside a
   * mutation's `onMutate` these writes are recorded and rolled back automatically
   * on failure.
   */
  setData: (
    instance: SanityInstance,
    params: TParams,
    updater: TData | ((current: TData | undefined) => TData),
  ) => {undo: () => void}
}

/**
 * Writes an entry's data in any fetcher. Passed to {@link MutationDefinition}
 * callbacks — mutations are the only holders of arbitrary write access; read
 * fetchers pull their data (see {@link FetcherDefinition.initialData}). Inside
 * `onMutate`, every write is recorded and undone automatically if the mutation
 * fails.
 *
 * @internal
 */
export type CacheWriter = <TParams extends unknown[], TData>(
  fetcher: Fetcher<TParams, TData>,
  params: TParams,
  updater: TData | ((current: TData | undefined) => TData),
) => void

/**
 * Resolves when the mutation settles on the server. `invalidated` tracks the
 * background reconciliation — the refetches triggered by
 * {@link MutationDefinition.invalidates} — for the rare caller that must wait for
 * full reconvergence rather than server settlement.
 *
 * @internal
 */
export interface MutationResult<TResult> {
  /** The server response */
  data: TResult
  /** Settles when the refetches of matched active entries complete */
  invalidated: Promise<void>
}

/**
 * Defines a mutation with optimistic cache updates. Lifecycle:
 *
 * 1. `onMutate` applies optimistic writes synchronously — the UI updates before
 *    the request leaves. Each entry carries a version counter that increments on
 *    every write. An optimistic write bumps the counter, so a revalidation already
 *    in flight lands "out of date" and is discarded rather than clobbering the
 *    optimistic write.
 * 2. The request runs. On failure, recorded writes are rolled back automatically
 *    — the cache is restored exactly, so failure ends the lifecycle here.
 * 3. On success, `onSuccess` may write the server response into the cache directly.
 * 4. On success, `invalidates` tags mark matching entries across the cache
 *    stale (active entries refetch), so the cache reconverges on server truth
 *    even if the optimistic shape was wrong.
 *
 * @internal
 */
export interface MutationDefinition<TInput, TResult> {
  /** Unique mutation name, used for devtools and request-tag derivation */
  name: string
  /** Creates the observable that performs the server mutation */
  mutationFn: (instance: SanityInstance) => (input: TInput) => Observable<TResult>
  /** Optimistic cache writes, applied synchronously before the request */
  onMutate?: (write: CacheWriter, input: TInput) => void
  /** Reconcile the cache with the server response, avoiding a refetch round-trip */
  onSuccess?: (write: CacheWriter, result: TResult, input: TInput) => void
  /**
   * Cache tags to invalidate on success. Failure invalidates nothing: recorded
   * optimistic writes roll back to the exact pre-mutation cache, and any
   * server-side ambiguity (e.g. timeout after commit) heals via `staleTime`.
   * A static array, or a function of the result/input.
   */
  invalidates?: CacheTag[] | ((result: TResult, input: TInput) => CacheTag[])
}

// --- Internal cache machinery -------------------------------------------------

/** Internal bookkeeping carried by every entry, on top of the public {@link FetcherSnapshot} fields. */
interface CacheEntryMeta {
  fetcherName: string
  /** The entry's cache key — unique across the whole cache */
  key: string
  params: unknown[]
  instance: SanityInstance
  /** Bumps on every write; a fetch whose result lands on a changed version is discarded */
  version: number
  /** Forced stale by invalidation, independent of `staleTime` */
  forcedStale: boolean
  tags: CacheTag[]
  subscriptions: number
}

/**
 * One entry in the shared cache: a {@link FetcherSnapshot} plus internal
 * bookkeeping. Discriminated on `status` like the snapshot, so `data` and
 * `dataUpdatedAt` are correctly typed per status. Generic over the fetcher's
 * `TData`; the store holds `CacheEntry` (i.e. `CacheEntry<unknown>`) because it
 * is shared across fetchers, and {@link asTyped} recovers a specific `TData` at
 * the read boundary. Immutable: replaced, never mutated in place.
 */
type CacheEntry<TData = unknown> = FetcherSnapshot<TData> & CacheEntryMeta

interface CacheState {
  entries: {[compoundKey: string]: CacheEntry}
}

interface InflightFetch {
  sub: Subscription
  promise: Promise<unknown>
  resolve: (data: unknown) => void
  reject: (error: unknown) => void
  startVersion: number
}

// Erased definition type used by the machinery, which is generic-agnostic.
type AnyDefinition = FetcherDefinition<unknown[], unknown>

// Module-level: the cache store is global (one instance across all Sanity
// instances, keyed only by fetcher key), so this bookkeeping lives alongside it.
const definitions = new Map<string, AnyDefinition>()
const inflight = new Map<string, InflightFetch>()
const gcTimers = new Map<string, ReturnType<typeof setTimeout>>()
const intervalTimers = new Map<string, ReturnType<typeof setInterval>>()
const snapshotCache = new WeakMap<CacheEntry, FetcherSnapshot<unknown>>()

const PENDING_SNAPSHOT: FetcherSnapshot<never> = {
  status: 'pending',
  data: undefined,
  error: undefined,
  isFetching: false,
  dataUpdatedAt: undefined,
}

/** Builds the cache key that identifies one entry: the fetcher's name namespacing its raw key. */
const entryKey = (fetcherName: string, rawKey: string): string => `${fetcherName}:${rawKey}`

const computeTags = (def: AnyDefinition, data: unknown, params: unknown[]): CacheTag[] =>
  typeof def.tags === 'function' ? def.tags(data, ...params) : (def.tags ?? [])

/**
 * Distinguishes an updater function from a replacement value. Sound because
 * cached data is API response data — never itself callable — so a callable
 * `updater` can only be the function arm. This lets us narrow without an `as`.
 */
const isUpdaterFn = <T>(
  updater: T | ((current: T | undefined) => T),
): updater is (current: T | undefined) => T => typeof updater === 'function'

/** Applies an updater — a replacement value, or a function of the current value. */
const applyUpdater = <T>(updater: T | ((current: T | undefined) => T), current: T | undefined): T =>
  isUpdaterFn(updater) ? updater(current) : updater

/** Whether an entry should fetch on subscribe: not already fetching, and either empty or stale. */
const needsFetch = (entry: CacheEntry, def: AnyDefinition): boolean => {
  if (entry.isFetching) return false
  if (entry.status !== 'success') return true
  return (
    entry.forcedStale ||
    Date.now() - (entry.dataUpdatedAt ?? 0) >= (def.staleTime ?? DEFAULT_STALE_TIME)
  )
}

/**
 * Views a stored entry as the calling fetcher's typed entry. The cache holds
 * every fetcher's entries as `CacheEntry<unknown>`, but keys are namespaced by
 * fetcher name, so an entry read under a fetcher's key holds that fetcher's
 * `TData` — the one sound `unknown → TData` seam (cf. TanStack's `getQueryData`).
 */
const asTyped = <TData>(entry: CacheEntry): CacheEntry<TData> => entry as CacheEntry<TData>

/** Snapshot for a given entry, memoised by entry identity so unrelated cache changes don't re-emit. */
const toSnapshot = <TData>(entry: CacheEntry<TData> | undefined): FetcherSnapshot<TData> => {
  if (!entry) return PENDING_SNAPSHOT
  const cached = snapshotCache.get(entry)
  if (cached) return cached as FetcherSnapshot<TData>

  let snapshot: FetcherSnapshot<TData>
  if (entry.status === 'success') {
    snapshot = {
      status: 'success',
      data: entry.data,
      error: entry.error,
      isFetching: entry.isFetching,
      dataUpdatedAt: entry.dataUpdatedAt,
    }
  } else if (entry.status === 'error') {
    snapshot = {
      status: 'error',
      data: undefined,
      error: entry.error,
      isFetching: entry.isFetching,
      dataUpdatedAt: undefined,
    }
  } else {
    snapshot = {
      status: 'pending',
      data: undefined,
      error: undefined,
      isFetching: entry.isFetching,
      dataUpdatedAt: undefined,
    }
  }

  snapshotCache.set(entry, snapshot)
  return snapshot
}

const cacheStore = defineStore<CacheState>({
  name: 'FetcherCache',
  getInitialState: () => ({entries: {}}),
  initialize: () => () => {
    // The global store is disposed only when the last Sanity instance is: tear
    // down every outstanding timer and fetch so nothing leaks between lifetimes.
    for (const timer of gcTimers.values()) clearTimeout(timer)
    for (const timer of intervalTimers.values()) clearInterval(timer)
    for (const fetch of inflight.values()) fetch.sub.unsubscribe()
    gcTimers.clear()
    intervalTimers.clear()
    inflight.clear()
  },
})

/** Immutably replace (or delete, when the updater returns `undefined`) one entry. */
const updateEntry = (
  state: StoreState<CacheState>,
  key: string,
  actionName: string,
  updater: (prev: CacheEntry | undefined) => CacheEntry | undefined,
): void => {
  state.set(actionName, (prev: CacheState) => {
    const next = updater(prev.entries[key])
    if (next === prev.entries[key]) return prev
    const entries = {...prev.entries}
    if (next === undefined) delete entries[key]
    else entries[key] = next
    return {entries}
  })
}

const baseEntry = (
  def: AnyDefinition,
  key: string,
  instance: SanityInstance,
  params: unknown[],
): CacheEntry => {
  const seeded = def.initialData?.(instance, ...params)
  if (seeded) {
    return {
      fetcherName: def.name,
      key,
      params,
      instance,
      status: 'success',
      data: seeded.data,
      error: undefined,
      dataUpdatedAt: seeded.dataUpdatedAt,
      isFetching: false,
      version: 0,
      forcedStale: false,
      tags: computeTags(def, seeded.data, params),
      subscriptions: 0,
    }
  }
  return {
    fetcherName: def.name,
    key,
    params,
    instance,
    status: 'pending',
    data: undefined,
    error: undefined,
    dataUpdatedAt: undefined,
    isFetching: false,
    version: 0,
    forcedStale: false,
    tags: [],
    subscriptions: 0,
  }
}

/**
 * Runs (or dedupes/restarts) the fetch for one entry, wiring the result back
 * into the cache. Returns a promise resolving with the entry's data once the
 * fetch settles — rejecting only when the entry has no data to serve.
 */
const startFetch = (
  state: StoreState<CacheState>,
  def: AnyDefinition,
  instance: SanityInstance,
  params: unknown[],
  force: boolean,
): Promise<unknown> => {
  const key = entryKey(def.name, def.getKey(instance, ...params))

  const existing = inflight.get(key)
  if (existing && !force) return existing.promise
  if (existing) {
    existing.sub.unsubscribe()
    inflight.delete(key)
  }

  updateEntry(state, key, 'fetchStart', (prev) => ({
    ...(prev ?? baseEntry(def, key, instance, params)),
    isFetching: true,
  }))
  const startVersion = state.get().entries[key]?.version ?? 0

  let resolve!: (data: unknown) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res
    reject = rej
  })

  // A forced fetch pre-empted one already in flight: forward this fetch's
  // settlement to the pre-empted promise so its awaiters don't hang forever.
  if (existing) void promise.then(existing.resolve, existing.reject)

  // Register before subscribing so a synchronous observable (whose `next`/
  // `complete` fire during `.subscribe()`) sees — and can clean up — its own record.
  const sub = new Subscription()
  inflight.set(key, {sub, promise, resolve, reject, startVersion})

  sub.add(
    def
      .fetch(instance)(...params)
      .subscribe({
        next: (data) => {
          const current = state.get().entries[key]
          if (current && current.version !== startVersion) {
            // A write (optimistic mutation) landed mid-fetch: discard the now-stale
            // server result and keep the written data. Tear the fetch down here —
            // a non-completing source won't fire `complete` to clear `isFetching`.
            inflight.delete(key)
            if (current.isFetching) {
              updateEntry(
                state,
                key,
                'fetchDiscard',
                (prev) => prev && {...prev, isFetching: false},
              )
            }
            resolve(current.data)
            sub.unsubscribe()
            return
          }
          updateEntry(state, key, 'fetchSuccess', (prev) => ({
            ...(prev ?? baseEntry(def, key, instance, params)),
            status: 'success',
            data,
            error: undefined,
            dataUpdatedAt: Date.now(),
            isFetching: false,
            forcedStale: false,
            tags: computeTags(def, data, params),
          }))
          resolve(data)
        },
        error: (error) => {
          updateEntry(state, key, 'fetchError', (prev) => {
            if (!prev) return prev
            // Keep rendering data if we have it (background failure); otherwise surface as error.
            if (prev.status === 'success') return {...prev, error, isFetching: false}
            return {...prev, status: 'error', error, isFetching: false}
          })
          inflight.delete(key)
          reject(error)
        },
        complete: () => {
          inflight.delete(key)
          const current = state.get().entries[key]
          if (current?.isFetching) {
            updateEntry(state, key, 'fetchSettle', (prev) => prev && {...prev, isFetching: false})
          }
        },
      }),
  )

  return promise
}

/**
 * Trigger a fetch without awaiting it. The failure is already reflected in the
 * entry's snapshot, so swallow the promise rejection to avoid an unhandled one.
 */
const detach = (promise: Promise<unknown>): void => {
  void promise.catch(() => {})
}

const markStale = (state: StoreState<CacheState>, key: string): void =>
  updateEntry(state, key, 'markStale', (prev) => prev && {...prev, forcedStale: true})

/** Polls an entry on `refetchInterval` while it has subscribers, skipping ticks while the tab is hidden. */
const startInterval = (
  state: StoreState<CacheState>,
  def: AnyDefinition,
  instance: SanityInstance,
  params: unknown[],
  key: string,
): void => {
  if (!def.refetchInterval || intervalTimers.has(key)) return
  const timer = setCleanupInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return
    const entry = state.get().entries[key]
    if (entry && entry.subscriptions > 0) detach(startFetch(state, def, instance, params, true))
  }, def.refetchInterval)
  intervalTimers.set(key, timer)
}

/**
 * Schedules an unsubscribed entry for garbage collection: after `gcTime` (from
 * now) its in-flight fetch is torn down and the entry removed. No-op if the
 * entry still has subscribers or a GC timer is already pending. Called from
 * every path that can leave an entry at zero subscribers — the unsubscribe
 * teardown, and the imperative `refetch`/`setData` writes that create entries
 * without ever subscribing. A later subscribe cancels the pending timer.
 */
const scheduleGc = (state: StoreState<CacheState>, def: AnyDefinition, key: string): void => {
  if (gcTimers.has(key)) return
  const entry = state.get().entries[key]
  if (!entry || entry.subscriptions > 0) return
  const timer = setCleanupTimeout(() => {
    gcTimers.delete(key)
    const fetch = inflight.get(key)
    if (fetch) {
      fetch.sub.unsubscribe()
      inflight.delete(key)
    }
    updateEntry(state, key, 'gc', () => undefined)
  }, def.gcTime ?? DEFAULT_GC_TIME)
  gcTimers.set(key, timer)
}

/** Shared across all fetchers: scans the whole cache and revalidates entries carrying any matched tag. */
const invalidateByTags = bindActionGlobally(
  cacheStore,
  ({state}: StoreContext<CacheState>, targets: CacheTag[]): Promise<void> => {
    const refetches: Promise<unknown>[] = []
    for (const [key, entry] of Object.entries(state.get().entries)) {
      const matches = entry.tags.some((tag) =>
        targets.some(
          (target) => tag.type === target.type && (target.id === undefined || tag.id === target.id),
        ),
      )
      if (!matches) continue
      markStale(state, key)
      if (entry.subscriptions <= 0) continue
      const def = definitions.get(entry.fetcherName)
      // Reconciliation is best-effort: a failed refetch surfaces on its snapshot,
      // and must not reject the caller's `invalidated` promise.
      if (def)
        refetches.push(
          startFetch(state, def, entry.instance, entry.params, true).catch(() => undefined),
        )
    }
    return Promise.all(refetches).then(() => undefined)
  },
)

/**
 * Registers a fetcher definition against the shared cache and returns its typed
 * handle.
 *
 * @internal
 */
export function defineFetcher<TParams extends unknown[], TData>(
  definition: FetcherDefinition<TParams, TData>,
): Fetcher<TParams, TData> {
  const def = definition as unknown as AnyDefinition
  definitions.set(definition.name, def)

  const getState = bindActionGlobally(
    cacheStore,
    createStateSourceAction<CacheState, TParams, FetcherSnapshot<TData>>({
      selector: ({state, instance}: SelectorContext<CacheState>, ...params: TParams) => {
        const key = entryKey(def.name, def.getKey(instance, ...params))
        const entry = state.entries[key]
        return toSnapshot(entry && asTyped<TData>(entry))
      },
      onSubscribe: ({state, instance}: StoreContext<CacheState>, ...params: TParams) => {
        const key = entryKey(def.name, def.getKey(instance, ...params))

        const pendingGc = gcTimers.get(key)
        if (pendingGc) {
          clearTimeout(pendingGc)
          gcTimers.delete(key)
        }

        updateEntry(state, key, 'subscribe', (prev) => ({
          ...(prev ?? baseEntry(def, key, instance, params)),
          instance,
          subscriptions: (prev?.subscriptions ?? 0) + 1,
        }))
        startInterval(state, def, instance, params, key)

        // Defer the fetch decision off the subscribe call stack (see the
        // `delay(0)` precedent in the legacy fetcher store) to avoid a
        // re-entrant cache write during subscription setup.
        queueMicrotask(() => {
          const entry = state.get().entries[key]
          if (entry && entry.subscriptions > 0 && needsFetch(entry, def)) {
            detach(startFetch(state, def, instance, params, false))
          }
        })

        return () => {
          updateEntry(
            state,
            key,
            'unsubscribe',
            (prev) => prev && {...prev, subscriptions: Math.max(0, prev.subscriptions - 1)},
          )
          const entry = state.get().entries[key]
          if (!entry || entry.subscriptions > 0) return

          const interval = intervalTimers.get(key)
          if (interval) {
            clearInterval(interval)
            intervalTimers.delete(key)
          }
          scheduleGc(state, def, key)
        }
      },
    }),
  )

  const resolveState = (instance: SanityInstance, ...params: TParams): Promise<TData> =>
    firstValueFrom(
      getState(instance, ...params).observable.pipe(
        filter(
          (snapshot): snapshot is Exclude<FetcherSnapshot<TData>, {status: 'pending'}> =>
            snapshot.status !== 'pending',
        ),
        map((snapshot) => {
          if (snapshot.status === 'error') throw snapshot.error
          return snapshot.data
        }),
      ),
    )

  const invalidate = bindActionGlobally(
    cacheStore,
    ({state, instance}: StoreContext<CacheState>, ...params: TParams) => {
      const key = entryKey(def.name, def.getKey(instance, ...params))
      markStale(state, key)
      const entry = state.get().entries[key]
      if (entry && entry.subscriptions > 0) detach(startFetch(state, def, instance, params, true))
    },
  )

  const invalidateAll = bindActionGlobally(cacheStore, ({state}: StoreContext<CacheState>) => {
    const prefix = `${def.name}:`
    for (const [key, entry] of Object.entries(state.get().entries)) {
      if (!key.startsWith(prefix)) continue
      markStale(state, key)
      if (entry.subscriptions > 0)
        detach(startFetch(state, def, entry.instance, entry.params, true))
    }
  })

  const refetch = bindActionGlobally(
    cacheStore,
    ({state, instance}: StoreContext<CacheState>, ...params: TParams): Promise<TData> => {
      const key = entryKey(def.name, def.getKey(instance, ...params))
      const promise = startFetch(state, def, instance, params, true) as Promise<TData>
      scheduleGc(state, def, key)
      return promise
    },
  )

  const setData = bindActionGlobally(
    cacheStore,
    (
      {state, instance}: StoreContext<CacheState>,
      params: TParams,
      updater: TData | ((current: TData | undefined) => TData),
    ) => {
      const key = entryKey(def.name, def.getKey(instance, ...params))
      let previous: CacheEntry | undefined
      updateEntry(state, key, 'setData', (prev) => {
        previous = prev
        const from = asTyped<TData>(prev ?? baseEntry(def, key, instance, params))
        const nextData = applyUpdater(updater, from.data)
        return {
          ...from,
          status: 'success',
          data: nextData,
          dataUpdatedAt: from.dataUpdatedAt ?? Date.now(),
          version: from.version + 1,
          tags: computeTags(def, nextData, params),
        }
      })
      scheduleGc(state, def, key)
      return {undo: () => updateEntry(state, key, 'undoSetData', () => previous)}
    },
  )

  return {getState, resolveState, invalidate, invalidateAll, refetch, setData}
}

/**
 * Creates a bound mutation from its definition. The returned action resolves at
 * server settlement — not after invalidation refetches, which run as background
 * reconciliation (see {@link MutationResult.invalidated}).
 *
 * @internal
 */
export function defineMutation<TInput, TResult>(
  definition: MutationDefinition<TInput, TResult>,
): (instance: SanityInstance, input: TInput) => Promise<MutationResult<TResult>> {
  return (instance, input) => {
    const undos: Array<() => void> = []
    const write: CacheWriter = (fetcher, params, updater) => {
      undos.push(fetcher.setData(instance, params, updater).undo)
    }

    definition.onMutate?.(write, input)

    return firstValueFrom(definition.mutationFn(instance)(input)).then(
      (result) => {
        definition.onSuccess?.(write, result, input)
        const targets =
          typeof definition.invalidates === 'function'
            ? definition.invalidates(result, input)
            : (definition.invalidates ?? [])
        const invalidated = targets.length ? invalidateByTags(instance, targets) : Promise.resolve()
        return {data: result, invalidated}
      },
      (error) => {
        for (let i = undos.length - 1; i >= 0; i--) undos[i]()
        throw error
      },
    )
  }
}
