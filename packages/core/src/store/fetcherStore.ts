import {
  concatMap,
  defer,
  EMPTY,
  expand,
  filter,
  firstValueFrom,
  map,
  type Observable,
  of,
  Subscription,
  take,
  tap,
  toArray,
} from 'rxjs'

import {getClientAuthState} from '../auth/authStore'
import {retryRead} from '../client/retry'
import {setCleanupInterval, setCleanupTimeout} from '../utils/setCleanupTimeout'
import {bindActionGlobally} from './createActionBinder'
import {type SanityInstance} from './createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from './createStateSourceAction'
import {UPSTREAM_CLOSE_DELAY_MS} from './createStoreInstance'
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
   * completes. A failure is retried by the rules of {@link retryRead}: a 401
   * once the credential changes, a network error or 5xx after a backoff. Each
   * retry calls the function `fetch` returns again, side effects included.
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
   * component throws. Rejects when the fetch fails, which for a network error
   * or 5xx is once its retries run out. When the entry's last fetch failed,
   * fetches again straight away, even if a retry is still waiting.
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
}

/**
 * Writes an entry's data in any fetcher. Passed to {@link MutationDefinition}
 * callbacks — mutations are the only holders of arbitrary write access; read
 * fetchers pull their data (see {@link FetcherDefinition.initialData}). Inside
 * `onMutate`, every write is a pending change that comes off when the mutation
 * settles; inside `onSuccess`, writes are the server's answer.
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
 *    the request leaves. Each write is kept as a pending change on its entry, on
 *    top of the entry's confirmed data, so other mutations' answers and refetches
 *    land underneath it rather than replacing it.
 * 2. The request runs, once earlier mutations with the same `scope` have
 *    settled, so their answers come back in order. On failure, this mutation's
 *    pending changes come off and any others stay, so failure ends the
 *    lifecycle here.
 * 3. On success, `onSuccess` may write the server response; it becomes the
 *    entry's confirmed data in place of this mutation's changes. An entry
 *    `onSuccess` doesn't write keeps the changes as confirmed.
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
  /**
   * Mutations with the same scope are sent one at a time, in the order they're made, so the server
   * keeps the last one. Without a scope, a mutation is sent straight away.
   */
  scope?: (input: TInput) => string
  /** Optimistic cache writes, applied synchronously before the request */
  onMutate?: (write: CacheWriter, input: TInput) => void
  /** Reconcile the cache with the server response, avoiding a refetch round-trip */
  onSuccess?: (write: CacheWriter, result: TResult, input: TInput) => void
  /**
   * Cache tags to invalidate on success. Failure invalidates nothing: the
   * mutation's optimistic changes come off, and any server-side ambiguity (e.g.
   * timeout after commit) heals via `staleTime`.
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
  /** Optimistic writes of mutations still in flight, applied in order on top of `confirmed` */
  pending: PendingChange[]
  /** What the entry shows without `pending`; only set while there are pending changes */
  confirmed: Confirmed | undefined
}

/** One optimistic write, tagged with the mutation call that made it. */
interface PendingChange {
  mutation: number
  updater: unknown
}

/** The parts of an entry a pending change is applied on top of. */
type Confirmed = Pick<CacheEntry, 'status' | 'data' | 'error' | 'dataUpdatedAt' | 'tags'>

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
  /** Set once an attempt fails, while `retryRead` retries it */
  failure?: {error: unknown}
  /** Reads a paged entry's next page, rather than every page again */
  nextPage: boolean
  /** Reads every page again, and the next page of one it replaced, so a load more isn't lost */
  extraPage: boolean
}

// Erased definition type used by the machinery, which is generic-agnostic.
type AnyDefinition = FetcherDefinition<unknown[], unknown>

// Module-level: the cache store is global (one instance across all Sanity
// instances, keyed only by fetcher key), so this bookkeeping lives alongside it.
const definitions = new Map<string, AnyDefinition>()
// So a mutation's writes, which name a fetcher, reach its definition
const fetcherDefinitions = new WeakMap<object, AnyDefinition>()
const inflight = new Map<string, InflightFetch>()
// Per mutation scope, when the last mutation in it settles. A later one's request waits for it, so
// answers come back in the order the changes were made
const lastWrites = new Map<string, Promise<void>>()
const gcTimers = new Map<string, ReturnType<typeof setTimeout>>()
const intervalTimers = new Map<string, ReturnType<typeof setInterval>>()
const stopTimers = new Map<string, ReturnType<typeof setTimeout>>()
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
    for (const timer of stopTimers.values()) clearTimeout(timer)
    for (const fetch of inflight.values()) fetch.sub.unsubscribe()
    gcTimers.clear()
    intervalTimers.clear()
    stopTimers.clear()
    inflight.clear()
    lastWrites.clear()
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
      pending: [],
      confirmed: undefined,
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
    pending: [],
    confirmed: undefined,
  }
}

const confirmedOf = ({status, data, error, dataUpdatedAt, tags}: CacheEntry): Confirmed =>
  ({status, data, error, dataUpdatedAt, tags}) as Confirmed

/**
 * The entry as shown: its confirmed parts with every pending change applied in order. Each
 * mutation's changes come off when it settles, so a late answer, a refusal or a refetch never
 * drops another mutation's change.
 */
const showChanges = (
  def: AnyDefinition,
  entry: CacheEntry,
  confirmed: Confirmed,
  pending: PendingChange[],
): CacheEntry => {
  const version = entry.version + 1
  if (!pending.length) {
    return {...entry, ...confirmed, version, pending, confirmed: undefined} as CacheEntry
  }
  const data = pending.reduce<unknown>(
    (current, change) => applyUpdater(change.updater, current),
    confirmed.data,
  )
  return {
    ...entry,
    status: 'success',
    data,
    error: confirmed.error,
    dataUpdatedAt: confirmed.dataUpdatedAt ?? Date.now(),
    tags: computeTags(def, data, entry.params),
    version,
    pending,
    confirmed,
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
  nextPage?: () => Observable<unknown>,
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
  const record: InflightFetch = {
    sub,
    promise,
    resolve,
    reject,
    startVersion: 0,
    nextPage: nextPage !== undefined,
    extraPage: !nextPage && Boolean(existing?.nextPage || existing?.extraPage),
  }
  inflight.set(key, record)

  sub.add(
    // Each attempt notes the version it starts from: a retry that starts after a write isn't stale
    defer(() => {
      record.startVersion = state.get().entries[key]?.version ?? 0
      return nextPage ? nextPage() : def.fetch(instance)(...params)
    })
      .pipe(
        take(1),
        tap({error: (error: unknown) => (record.failure = {error})}),
        retryRead(getClientAuthState(instance), (error) => {
          // A shown failure comes off once the read recovers, or moves on to one not shown yet
          if (error === undefined) {
            updateEntry(state, key, 'fetchRetry', (prev) => {
              if (!prev || prev.error === undefined) return prev
              if (prev.status === 'success') return {...prev, error: undefined, isFetching: true}
              return {...prev, status: 'pending', error: undefined, isFetching: true}
            })
            return
          }
          updateEntry(state, key, 'fetchError', (prev) => {
            if (!prev) return prev
            // Keep rendering data if we have it (background failure); otherwise surface as error.
            if (prev.status === 'success') return {...prev, error, isFetching: false}
            return {...prev, status: 'error', error, isFetching: false}
          })
          reject(error)
        }),
      )
      .subscribe({
        next: (data) => {
          const current = state.get().entries[key]
          // An entry still without data, like one whose only change was refused mid-fetch, has
          // nothing newer than this result, so it takes it
          if (current && current.version !== record.startVersion && current.data !== undefined) {
            // A write (optimistic mutation) landed mid-fetch: discard the now-stale
            // server result and keep the written data. Tear the fetch down here —
            // a non-completing source won't fire `complete` to clear `isFetching`.
            inflight.delete(key)
            // An error an earlier attempt showed is out of date now this one has been answered
            if (current.isFetching || current.error !== undefined) {
              updateEntry(
                state,
                key,
                'fetchDiscard',
                (prev) => prev && {...prev, isFetching: false, error: undefined},
              )
            }
            resolve(current.data)
            sub.unsubscribe()
            return
          }
          if (current?.pending.length) {
            // The server's latest, or all there is; changes still in flight go on top
            updateEntry(
              state,
              key,
              'fetchUnderChanges',
              (prev) =>
                prev &&
                showChanges(
                  def,
                  {...prev, isFetching: false, forcedStale: false},
                  {
                    status: 'success',
                    data,
                    error: undefined,
                    dataUpdatedAt: Date.now(),
                    tags: computeTags(def, data, params),
                  },
                  prev.pending,
                ),
            )
            resolve(state.get().entries[key]?.data)
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
    // A poll would cancel the next page, as it reads only the pages before it. A next page that
    // keeps failing holds the poll off until it's read or nobody watches the list
    if (inflight.get(key)?.nextPage) return
    if (entry && entry.subscriptions > 0) detach(startFetch(state, def, instance, params, true))
  }, def.refetchInterval)
  intervalTimers.set(key, timer)
}

/**
 * Schedules an unsubscribed entry for garbage collection: after `gcTime` (from
 * now) its in-flight fetch is torn down and the entry removed. No-op if the
 * entry still has subscribers or a GC timer is already pending. Called from
 * every path that can leave an entry at zero subscribers — the unsubscribe
 * teardown, and the imperative `refetch`, `resolveState` retry and mutation writes
 * that fetch or create entries without ever subscribing. A later subscribe cancels
 * the pending timer.
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

/**
 * A second after an entry stops being watched, stops retrying its failed fetch, as the query
 * store does, and marks the entry stale so the next subscriber fetches again.
 */
const stopUnwatchedRetry = (state: StoreState<CacheState>, key: string): void => {
  clearTimeout(stopTimers.get(key))
  const timer = setCleanupTimeout(() => {
    stopTimers.delete(key)
    const fetch = inflight.get(key)
    if (!fetch?.failure || (state.get().entries[key]?.subscriptions ?? 0) > 0) return
    fetch.sub.unsubscribe()
    inflight.delete(key)
    fetch.reject(fetch.failure.error)
    updateEntry(
      state,
      key,
      'stopRetry',
      (prev) => prev && {...prev, isFetching: false, forcedStale: true},
    )
  }, UPSTREAM_CLOSE_DELAY_MS)
  stopTimers.set(key, timer)
}

const cancelGc = (key: string): void => {
  const timer = gcTimers.get(key)
  if (!timer) return
  clearTimeout(timer)
  gcTimers.delete(key)
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
        cancelGc(key)
        clearTimeout(stopTimers.get(key))
        stopTimers.delete(key)

        updateEntry(state, key, 'subscribe', (prev) => ({
          ...(prev ?? baseEntry(def, key, instance, params)),
          instance,
          subscriptions: (prev?.subscriptions ?? 0) + 1,
        }))
        startInterval(state, def, instance, params, key)

        // Defer the fetch decision off the subscribe call stack to avoid a
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
          stopUnwatchedRetry(state, key)
        }
      },
    }),
  )

  const resolveState = bindActionGlobally(
    cacheStore,
    // Async so a key that can't be built rejects, like a failed fetch, instead of throwing
    async ({state, instance}: StoreContext<CacheState>, ...params: TParams): Promise<TData> => {
      const key = entryKey(def.name, def.getKey(instance, ...params))
      // An error left by an earlier fetch is not an answer: fetch again now, restarting a retry
      // that is waiting on a backoff or a new token, keeping garbage collection off the entry
      // until that fetch settles
      if (state.get().entries[key]?.status === 'error') {
        cancelGc(key)
        const retrying = inflight.get(key)?.failure !== undefined
        return (startFetch(state, def, instance, params, retrying) as Promise<TData>).finally(
          () => {
            scheduleGc(state, def, key)
            stopUnwatchedRetry(state, key)
          },
        )
      }
      return firstValueFrom(
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
    },
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
      return promise.finally(() => stopUnwatchedRetry(state, key))
    },
  )

  const fetcher = {getState, resolveState, invalidate, invalidateAll, refetch}
  fetcherDefinitions.set(fetcher, def)
  return fetcher
}

/**
 * One page of a list the API answers a page at a time: its items, and the cursor to read the page
 * after it with, or `null` on the last page.
 *
 * @internal
 */
export interface CursorPage {
  data: unknown[]
  nextCursor: string | null
}

/**
 * A {@link FetcherDefinition} for a list the API answers a page at a time. An entry holds the
 * pages read so far, in order.
 *
 * @internal
 */
export interface PagedFetcherDefinition<
  TParams extends unknown[],
  TPage extends CursorPage,
> extends Omit<FetcherDefinition<TParams, TPage[]>, 'fetch' | 'initialData'> {
  /**
   * Reads one page: the first without a cursor, each one after with the `nextCursor` of the page
   * before. Return an observable that emits the page.
   */
  fetch: (
    instance: SanityInstance,
  ) => (cursor: string | undefined, ...params: TParams) => Observable<TPage>
}

/**
 * A {@link Fetcher} over the pages of a list read so far, returned by {@link definePagedFetcher}.
 * A refetch, after a change or on the poll, reads every one of them again from the first, so an
 * item never shows twice or goes missing. A refetch that starts while `loadMore` reads the next page
 * reads that page too.
 *
 * @internal
 */
export interface PagedFetcher<TParams extends unknown[], TPage extends CursorPage> extends Fetcher<
  TParams,
  TPage[]
> {
  /**
   * Reads the page after the last one read and adds it. Called again while that page loads, it
   * shares the read. A failure rejects and shows on the entry's `error`, keeping the pages read so
   * far. Resolves with the pages read so far when there's no page after them.
   */
  loadMore: (instance: SanityInstance, ...params: TParams) => Promise<TPage[]>
}

/**
 * Registers a fetcher for a list the API answers a page at a time, like TanStack Query's infinite
 * queries, against the shared cache. An entry's data is the pages read so far, so a mutation that
 * writes to one updates an array of pages, and readers outside React join them.
 *
 * @internal
 */
export function definePagedFetcher<TParams extends unknown[], TPage extends CursorPage>({
  fetch: fetchPage,
  ...definition
}: PagedFetcherDefinition<TParams, TPage>): PagedFetcher<TParams, TPage> {
  const pagesDefinition: FetcherDefinition<TParams, TPage[]> = {
    ...definition,
    fetch:
      (instance) =>
      (...params) => {
        const read = (cursor?: string) => fetchPage(instance)(cursor, ...params).pipe(take(1))
        const pages = fetcher.getState(instance, ...params).getCurrent().data?.length ?? 1
        const key = entryKey(definition.name, definition.getKey(instance, ...params))
        const count = inflight.get(key)?.extraPage ? pages + 1 : pages
        return read().pipe(
          expand((page, index) =>
            page.nextCursor !== null && index + 1 < count ? read(page.nextCursor) : EMPTY,
          ),
          toArray(),
        )
      },
  }
  const fetcher = defineFetcher(pagesDefinition)
  const def = pagesDefinition as unknown as AnyDefinition

  const loadMore: PagedFetcher<TParams, TPage>['loadMore'] = bindActionGlobally(
    cacheStore,
    ({state, instance}: StoreContext<CacheState>, ...params: TParams): Promise<TPage[]> => {
      const loading = inflight.get(entryKeyOf(def, instance, params))
      // A next page retrying after a failure is read again now, as `resolveState` does
      if (loading?.nextPage && !loading.failure) return loading.promise as Promise<TPage[]>
      // A refetch, like the one after a change, goes first, even while it retries, so the next
      // page follows its pages
      if (loading && !loading.nextPage) {
        return loading.promise.then(() => loadMore(instance, ...params))
      }
      const pages = fetcher.getState(instance, ...params).getCurrent().data
      const cursor = pages?.at(-1)?.nextCursor
      if (!pages || typeof cursor !== 'string') return fetcher.resolveState(instance, ...params)
      return startFetch(state, def, instance, params, true, () =>
        fetchPage(instance)(cursor, ...params).pipe(map((page) => [...pages, page])),
      ) as Promise<TPage[]>
    },
  )

  const paged = {...fetcher, loadMore}
  fetcherDefinitions.set(paged, def)
  return paged
}

const entryKeyOf = (def: AnyDefinition, instance: SanityInstance, params: unknown[]): string =>
  entryKey(def.name, def.getKey(instance, ...params))

/** Records a mutation's optimistic write as a pending change on the entry, shown at once. */
const addChange = bindActionGlobally(
  cacheStore,
  (
    {state, instance}: StoreContext<CacheState>,
    def: AnyDefinition,
    params: unknown[],
    change: PendingChange,
  ) => {
    const key = entryKeyOf(def, instance, params)
    updateEntry(state, key, 'addChange', (prev) => {
      const from = prev ?? baseEntry(def, key, instance, params)
      return showChanges(def, from, from.confirmed ?? confirmedOf(from), [...from.pending, change])
    })
    scheduleGc(state, def, key)
  },
)

/**
 * Takes a settled mutation's changes off the entry. On success they become confirmed: replaced by
 * its `onSuccess` writes when it made any, or else kept as the server accepted them. On failure
 * they're dropped. Other mutations' changes stay on top either way.
 */
const settleChanges = bindActionGlobally(
  cacheStore,
  (
    {state, instance}: StoreContext<CacheState>,
    def: AnyDefinition,
    params: unknown[],
    mutation: number,
    {succeeded, confirms}: {succeeded: boolean; confirms: unknown[]},
  ) => {
    const key = entryKeyOf(def, instance, params)
    updateEntry(state, key, 'settleChanges', (prev) => {
      if (!prev && !confirms.length) return prev
      const from = prev ?? baseEntry(def, key, instance, params)
      const own = from.pending.filter((change) => change.mutation === mutation)
      const accepted = succeeded && !confirms.length ? own.map(({updater}) => updater) : []
      const confirmed = [...accepted, ...confirms].reduce<Confirmed>(
        (current, updater) => {
          const data = applyUpdater(updater, current.data)
          return {
            status: 'success',
            data,
            error: undefined,
            dataUpdatedAt: current.dataUpdatedAt ?? Date.now(),
            tags: computeTags(def, data, params),
          }
        },
        from.confirmed ?? confirmedOf(from),
      )
      const pending = from.pending.filter((change) => change.mutation !== mutation)
      return showChanges(def, from, confirmed, pending)
    })
    scheduleGc(state, def, key)
  },
)

let mutationCount = 0

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
    const mutation = ++mutationCount
    // Every entry this call writes to, with the `onSuccess` writes to apply when it settles
    const touched = new Map<string, {def: AnyDefinition; params: unknown[]; confirms: unknown[]}>()
    const touch = (fetcher: object, params: unknown[]) => {
      const def = fetcherDefinitions.get(fetcher)
      if (!def) throw new Error('A mutation wrote to a fetcher that `defineFetcher` did not create')
      const key = entryKeyOf(def, instance, params)
      const entry = touched.get(key) ?? {def, params, confirms: []}
      touched.set(key, entry)
      return entry
    }
    const settle = (succeeded: boolean) => {
      for (const {def, params, confirms} of touched.values()) {
        settleChanges(instance, def, params, mutation, {succeeded, confirms})
      }
    }

    definition.onMutate?.((fetcher, params, updater) => {
      addChange(instance, touch(fetcher, params).def, params, {mutation, updater})
    }, input)

    const scope = definition.scope?.(input)
    const earlier = scope === undefined ? undefined : lastWrites.get(scope)
    // `of` sends a request with nothing ahead of it straight away. `concatMap` turns a request that
    // throws before it's sent into a rejection, so its changes come off
    const request = firstValueFrom(
      defer(() => earlier ?? of(undefined)).pipe(
        concatMap(() => definition.mutationFn(instance)(input)),
      ),
    )
    if (scope !== undefined) {
      const settled = request.then(
        () => {},
        () => {},
      )
      lastWrites.set(scope, settled)
      void settled.then(() => {
        if (lastWrites.get(scope) === settled) lastWrites.delete(scope)
      })
    }

    return request.then(
      (result) => {
        definition.onSuccess?.(
          (fetcher, params, updater) => {
            touch(fetcher, params).confirms.push(updater)
          },
          result,
          input,
        )
        settle(true)
        const targets =
          typeof definition.invalidates === 'function'
            ? definition.invalidates(result, input)
            : (definition.invalidates ?? [])
        const invalidated = targets.length ? invalidateByTags(instance, targets) : Promise.resolve()
        return {data: result, invalidated}
      },
      (error) => {
        settle(false)
        throw error
      },
    )
  }
}
