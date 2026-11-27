import {
  type DocumentHandle as CoreDocumentHandle,
  type DocumentHistoryEvent,
  type DocumentResource,
  type DocumentsHistoryOptions,
  getDocumentsHistoryErrorState,
  getDocumentsHistoryHasMoreState,
  getDocumentsHistoryState,
  loadMoreDocumentsHistory,
  type PerspectiveHandle,
  refetchDocumentsHistory,
  resolveDocumentsHistory,
  type SanityInstance,
} from '@sanity/sdk'
import {
  getDocumentsHistoryOptionsKey,
  isDeepEqual,
  parseDocumentsHistoryOptionsKey,
} from '@sanity/sdk/_internal'
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'

import {type DocumentHandle} from '../../config/handles'
import {PerspectiveContext} from '../../context/PerspectiveContext'
import {ResourcesContext} from '../../context/ResourcesContext'
import {useSanityInstance} from '../context/useSanityInstance'
import {
  normalizeResourceOptions,
  useEffectiveContextResource,
} from '../helpers/useNormalizedResourceOptions'
import {trackHookUsage} from '../helpers/useTrackHookUsage'
import {withSdkOrigin} from '../helpers/withSdkOrigin'

/**
 * Options for {@link useDocumentsHistory}.
 *
 * @public
 * @category Types
 * @category Document History
 */
export interface UseDocumentsHistoryOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> {
  /**
   * Document handles to read history for. Each handle can specify its own `perspective`
   * (falling back to context or `'drafts'`). All handles must belong to the same resource.
   */
  documents: ReadonlyArray<DocumentHandle<string, TDataset, TProjectId>>
  /**
   * Page size for the merged History Events API stream (1-100).
   *
   * @defaultValue 100
   */
  limit?: number
}

/**
 * Return value of {@link useDocumentsHistory}.
 *
 * @public
 * @category Types
 * @category Document History
 */
export interface UseDocumentsHistoryResult {
  /** History events ordered newest first. */
  data: DocumentHistoryEvent[]
  /** True when older pages are available via `loadMore`. */
  hasMore: boolean
  /** True while paginating or transitioning between document selections. */
  isPending: boolean
  /** Non-fatal error from a background reload, listener failure, or `loadMore` after initial load. */
  error: unknown
  /** Loads the next page of older events inside a transition. */
  loadMore: () => void
  /** Reloads the latest events from the server. */
  refetch: () => Promise<void>
}

const EMPTY_OPTIONS: DocumentsHistoryOptions = {documents: []}

function createDeferredHistoryEntry(key: string) {
  const controller = new AbortController()
  return {
    key,
    signal: controller.signal,
    abort: () => controller.abort(),
  }
}

function normalizeDocumentsHistoryOptions(
  documents: UseDocumentsHistoryOptions['documents'],
  limit: number | undefined,
  resources: Record<string, DocumentResource>,
  effectiveContextResource: DocumentResource | undefined,
  contextPerspective: PerspectiveHandle['perspective'],
): {
  normalized: DocumentsHistoryOptions
  validationError: Error | undefined
} {
  try {
    const normalizedHandles: CoreDocumentHandle[] = []
    let sharedResource: DocumentResource | undefined

    for (const handle of documents) {
      const normalized = normalizeResourceOptions(
        handle,
        resources,
        effectiveContextResource,
        contextPerspective,
      ) as CoreDocumentHandle

      if (normalized.resource) {
        if (!sharedResource) {
          sharedResource = normalized.resource
        } else if (!isDeepEqual(normalized.resource, sharedResource)) {
          return {
            normalized: EMPTY_OPTIONS,
            validationError: new Error(
              `Mismatched resources found in documents. All documents must belong to the same resource. Found "${JSON.stringify(normalized.resource)}" but expected "${JSON.stringify(sharedResource)}".`,
            ),
          }
        }
      }

      normalizedHandles.push(normalized)
    }

    return {
      normalized: {
        documents: normalizedHandles,
        ...(limit !== undefined ? {limit} : {}),
      },
      validationError: undefined,
    }
  } catch (error) {
    return {
      normalized: EMPTY_OPTIONS,
      validationError: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

function useNormalizedDocumentsHistoryOptions({documents, limit}: UseDocumentsHistoryOptions): {
  normalized: DocumentsHistoryOptions
  validationError: Error | undefined
} {
  const resources = useContext(ResourcesContext)
  const effectiveContextResource = useEffectiveContextResource()
  const contextPerspective = useContext(PerspectiveContext)

  return useMemo(
    () =>
      normalizeDocumentsHistoryOptions(
        documents,
        limit,
        resources,
        effectiveContextResource,
        contextPerspective,
      ),
    [documents, limit, resources, effectiveContextResource, contextPerspective],
  )
}

function useDeferredHistoryOptions(normalized: DocumentsHistoryOptions) {
  const currentKey = getDocumentsHistoryOptionsKey(normalized)
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

  const activeOptions = useMemo(() => parseDocumentsHistoryOptionsKey(deferred.key), [deferred.key])

  return {activeOptions, signal: deferred.signal, isTransitionPending}
}

function useHistorySnapshot(instance: SanityInstance, activeOptions: DocumentsHistoryOptions) {
  const historySource = useMemo(
    () => getDocumentsHistoryState(instance, activeOptions),
    [activeOptions, instance],
  )
  const hasMoreSource = useMemo(
    () => getDocumentsHistoryHasMoreState(instance, activeOptions),
    [activeOptions, instance],
  )
  const errorSource = useMemo(
    () => getDocumentsHistoryErrorState(instance, activeOptions),
    [activeOptions, instance],
  )

  const events = useSyncExternalStore(historySource.subscribe, historySource.getCurrent)
  const hasMore = useSyncExternalStore(hasMoreSource.subscribe, hasMoreSource.getCurrent)
  const error = useSyncExternalStore(errorSource.subscribe, errorSource.getCurrent)

  return {events, hasMore, error}
}

function useHistoryActions(instance: SanityInstance, activeOptions: DocumentsHistoryOptions) {
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [, startLoadMoreTransition] = useTransition()

  const loadMore = useCallback(() => {
    setIsLoadingMore(true)
    const clearLoading = () => setIsLoadingMore(false)
    startLoadMoreTransition(() =>
      loadMoreDocumentsHistory(instance, activeOptions).then(clearLoading, clearLoading),
    )
  }, [activeOptions, instance])

  const refetch = useCallback(
    () => refetchDocumentsHistory(instance, activeOptions),
    [activeOptions, instance],
  )

  return {isLoadingMore, loadMore, refetch}
}

function useDocumentsHistoryImpl(options: UseDocumentsHistoryOptions): UseDocumentsHistoryResult {
  const instance = useSanityInstance()
  trackHookUsage(instance, 'useDocumentsHistory')

  const {normalized, validationError} = useNormalizedDocumentsHistoryOptions(options)
  const {activeOptions, signal, isTransitionPending} = useDeferredHistoryOptions(normalized)
  const {events, hasMore, error} = useHistorySnapshot(instance, activeOptions)
  const {isLoadingMore, loadMore, refetch} = useHistoryActions(instance, activeOptions)

  // All hooks have run unconditionally — safe to throw validation or suspense promises now.
  if (validationError) {
    throw validationError
  }
  if (events === undefined) {
    throw resolveDocumentsHistory(instance, {...activeOptions, signal})
  }

  const isPending = isTransitionPending || isLoadingMore

  return useMemo(
    () => ({
      data: events,
      hasMore,
      isPending,
      error,
      loadMore,
      refetch,
    }),
    [error, events, hasMore, isPending, loadMore, refetch],
  )
}

/**
 * Reads the merged history timeline for one or more documents, keeping it synchronized with live
 * changes and supporting cursor pagination.
 *
 * Each handle in `documents` may specify its own `perspective` (for example, combining draft and
 * published variants of the same document, or multiple documents in a single timeline). Passing an
 * empty `documents` array returns an empty result synchronously without suspending or issuing a
 * network request.
 *
 * Suspends until the initial timeline has loaded. Changing `documents` or `limit` runs inside a
 * React transition so previously loaded events remain visible with `isPending: true` while the
 * new timeline loads.
 *
 * @public
 * @category Document History
 * @function
 * @param options - Document handles and optional history configuration (`limit`)
 * @returns Timeline events, pagination status, and actions (`loadMore`, `refetch`)
 *
 * @example Render a document's history timeline
 * ```tsx
 * import {useDocumentsHistory, type DocumentHandle} from '@sanity/sdk-react'
 *
 * function HistoryTimeline({doc}: {doc: DocumentHandle}) {
 *   const {data: events, hasMore, isPending, loadMore} = useDocumentsHistory({
 *     documents: [{...doc, perspective: 'published'}],
 *   })
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
export const useDocumentsHistory: <
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: UseDocumentsHistoryOptions<TDataset, TProjectId>,
) => UseDocumentsHistoryResult = withSdkOrigin(useDocumentsHistoryImpl)
