import {
  type DocumentHistoryEvent,
  type DocumentHistoryOptions,
  expandDocumentHistoryEvent,
  getDocumentHistoryErrorState,
  getDocumentHistoryHasMoreState,
  getDocumentHistoryState,
  loadMoreDocumentHistory,
  refetchDocumentHistory,
  resolveDocumentHistory,
  type SanityInstance,
} from '@sanity/sdk'
import {getDocumentHistoryOptionsKey, parseDocumentHistoryOptionsKey} from '@sanity/sdk/_internal'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'

import {type DocumentHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'
import {withSdkOrigin} from '../helpers/withSdkOrigin'

/**
 * Options for {@link useDocumentHistory}.
 *
 * @beta
 * @category Types
 * @category Documents
 */
export interface UseDocumentHistoryOptions<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  /**
   * Page size for the History Events API (1-100).
   *
   * @defaultValue 100
   */
  limit?: number
  /**
   * Whether to synthesize 5-minute grouped edit events from `/transactions` for drafts and
   * versions.
   *
   * @defaultValue true
   */
  includeEditEvents?: boolean
}

/**
 * Return value of {@link useDocumentHistory}.
 *
 * @beta
 * @category Types
 * @category Documents
 */
export interface UseDocumentHistoryResult {
  /** History events ordered newest first. */
  events: DocumentHistoryEvent[]
  /** True when older pages are available via `loadMore`. */
  hasMore: boolean
  /** True while paginating or transitioning between document handles. */
  isPending: boolean
  /** Non-fatal error from a background reload, listener failure, or `loadMore` after initial load. */
  error: unknown
  /** Loads the next page of older events inside a transition. */
  loadMore: () => void
  /** Fetches the edit events that led up to a publish or discard event. */
  expandEvent: (eventId: string) => Promise<void>
  /** Reloads the latest events from the server. */
  refetch: () => Promise<void>
}

function createDeferredHistoryEntry(key: string) {
  const controller = new AbortController()
  return {
    key,
    signal: controller.signal,
    abort: () => controller.abort(),
  }
}

function useDeferredHistoryOptions(normalized: DocumentHistoryOptions) {
  const currentKey = getDocumentHistoryOptionsKey(normalized)
  const [isTransitionPending, startTransition] = useTransition()
  const [deferred, setDeferred] = useState(() => createDeferredHistoryEntry(currentKey))
  const activeAbortRef = useRef(deferred.abort)

  useEffect(() => {
    activeAbortRef.current = deferred.abort
  }, [deferred.abort])

  useEffect(() => {
    if (currentKey === deferred.key) return
    activeAbortRef.current()
    const next = createDeferredHistoryEntry(currentKey)
    activeAbortRef.current = next.abort
    startTransition(() => {
      setDeferred(next)
    })
  }, [currentKey, deferred.key])

  useEffect(() => () => activeAbortRef.current(), [])

  const activeOptions = useMemo(() => parseDocumentHistoryOptionsKey(deferred.key), [deferred.key])

  return {activeOptions, signal: deferred.signal, isTransitionPending}
}

function useHistorySnapshot(
  instance: SanityInstance,
  activeOptions: DocumentHistoryOptions,
  signal: AbortSignal,
) {
  const historySource = useMemo(
    () => getDocumentHistoryState(instance, activeOptions),
    [activeOptions, instance],
  )
  const hasMoreSource = useMemo(
    () => getDocumentHistoryHasMoreState(instance, activeOptions),
    [activeOptions, instance],
  )
  const errorSource = useMemo(
    () => getDocumentHistoryErrorState(instance, activeOptions),
    [activeOptions, instance],
  )

  if (historySource.getCurrent() === undefined) {
    throw resolveDocumentHistory(instance, {...activeOptions, signal})
  }

  const events = useSyncExternalStore(
    historySource.subscribe,
    historySource.getCurrent,
  ) as DocumentHistoryEvent[]
  const hasMore = useSyncExternalStore(hasMoreSource.subscribe, hasMoreSource.getCurrent)
  const error = useSyncExternalStore(errorSource.subscribe, errorSource.getCurrent)

  return {events, hasMore, error}
}

function useHistoryActions(instance: SanityInstance, activeOptions: DocumentHistoryOptions) {
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [, startLoadMoreTransition] = useTransition()

  const loadMore = useCallback(() => {
    setIsLoadingMore(true)
    const clearLoading = () => setIsLoadingMore(false)
    startLoadMoreTransition(() =>
      loadMoreDocumentHistory(instance, activeOptions).then(clearLoading, clearLoading),
    )
  }, [activeOptions, instance])

  const expandEvent = useCallback(
    (eventId: string) => expandDocumentHistoryEvent(instance, activeOptions, eventId),
    [activeOptions, instance],
  )

  const refetch = useCallback(
    () => refetchDocumentHistory(instance, activeOptions),
    [activeOptions, instance],
  )

  return {isLoadingMore, loadMore, expandEvent, refetch}
}

function useDocumentHistoryImpl(options: UseDocumentHistoryOptions): UseDocumentHistoryResult {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useDocumentHistory')

  const normalized = useNormalizedResourceOptions(options) as DocumentHistoryOptions
  const {activeOptions, signal, isTransitionPending} = useDeferredHistoryOptions(normalized)
  const {events, hasMore, error} = useHistorySnapshot(instance, activeOptions, signal)
  const {isLoadingMore, loadMore, expandEvent, refetch} = useHistoryActions(instance, activeOptions)
  const isPending = isTransitionPending || isLoadingMore

  return useMemo(
    () => ({
      events,
      hasMore,
      isPending,
      error,
      loadMore,
      expandEvent,
      refetch,
    }),
    [error, events, expandEvent, hasMore, isPending, loadMore, refetch],
  )
}

/**
 * Reads a document's history timeline, keeping it synchronized with live changes and supporting
 * cursor pagination and on-demand expansion of publish/discard lifecycles.
 *
 * Suspends until the initial timeline has loaded. Changing document handles or options runs inside
 * a React transition so previously loaded events remain visible with `isPending: true` while the
 * new timeline loads.
 *
 * @beta
 * @category Documents
 * @function
 * @param options - Document handle and optional history configuration (`limit`, `includeEditEvents`)
 * @returns Timeline events, pagination status, and actions (`loadMore`, `expandEvent`, `refetch`)
 *
 * @example Render a document's history timeline
 * ```tsx
 * import {useDocumentHistory, type DocumentHandle} from '@sanity/sdk-react'
 *
 * function HistoryTimeline({doc}: {doc: DocumentHandle}) {
 *   const {events, hasMore, isPending, loadMore} = useDocumentHistory(doc)
 *
 *   return (
 *     <div>
 *       <ul>
 *         {events.map((event) => (
 *           <li key={event.id}>
 *             {event.type} — {event.timestamp}
 *           </li>
 *         ))}
 *       </ul>
 *       {hasMore && (
 *         <button disabled={isPending} onClick={loadMore}>
 *           Load older events
 *         </button>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
export const useDocumentHistory: <
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: UseDocumentHistoryOptions<TDocumentType, TDataset, TProjectId>,
) => UseDocumentHistoryResult = withSdkOrigin(useDocumentHistoryImpl)
