import {
  type DocumentHistoryCreatedEvent,
  type DocumentHistoryEditedEvent,
  documentHistoryEventEdits,
  type DocumentHistoryEventEditsOptions,
  type ExpandableDocumentHistoryEvent,
} from '@sanity/sdk'

import {type ResourceHandle} from '../../config/handles'
import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {useTrackHookUsage} from '../helpers/useTrackHookUsage'
import {withSdkOrigin} from '../helpers/withSdkOrigin'

/**
 * Options for {@link useDocumentHistoryEventEdits}.
 *
 * @public
 * @category Types
 * @category Document History
 */
export interface UseDocumentHistoryEventEditsOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends ResourceHandle<TDataset, TProjectId> {
  /** Completed `published` or `discarded` lifecycle event to expand. */
  event: ExpandableDocumentHistoryEvent
}

const useDocumentHistoryEventEditsBase = createFetcherHook(documentHistoryEventEdits)

function useDocumentHistoryEventEditsImpl(
  options: UseDocumentHistoryEventEditsOptions,
): FetcherHookResult<Array<DocumentHistoryEditedEvent | DocumentHistoryCreatedEvent>> {
  useTrackHookUsage('useDocumentHistoryEventEdits')
  const normalized = useNormalizedResourceOptions(options) as DocumentHistoryEventEditsOptions
  return useDocumentHistoryEventEditsBase(normalized)
}

/**
 * Fetches the intermediate `edited` events (and trailing `created` event when available) that
 * occurred during a completed `published` or `discarded` draft or release version lifecycle,
 * ordered newest first.
 *
 * Suspends until the range has loaded and caches the immutable result via the shared transaction
 * fetcher cache, so collapsing and re-expanding a row renders immediately without re-fetching.
 * Use `isExpandableHistoryEvent` to narrow a `DocumentHistoryEvent` before rendering
 * a component that calls this hook.
 *
 * @public
 * @category Document History
 * @function
 * @param options - Resource options (or document handle) and the expandable lifecycle `event`
 * @returns A {@link FetcherHookResult} whose `data` is the ordered lifecycle edits and creation event
 *
 * @example Expand a published or discarded lifecycle on demand
 * ```tsx
 * import {Suspense, useState} from 'react'
 * import {
 *   isExpandableHistoryEvent,
 *   useDocumentHistoryEventEdits,
 *   type DocumentHistoryEvent,
 *   type ExpandableDocumentHistoryEvent,
 * } from '@sanity/sdk-react'
 *
 * function LifecycleEdits({event}: {event: ExpandableDocumentHistoryEvent}) {
 *   const {data: edits} = useDocumentHistoryEventEdits({event})
 *   return (
 *     <ul>
 *       {edits.map((item) => (
 *         <li key={item.id}>
 *           {item.type} — {item.timestamp}
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 *
 * function HistoryRow({event}: {event: DocumentHistoryEvent}) {
 *   const [expanded, setExpanded] = useState(false)
 *   const expandable = isExpandableHistoryEvent(event)
 *
 *   return (
 *     <li>
 *       <span>{event.type}</span>
 *       {expandable && (
 *         <button onClick={() => setExpanded((prev) => !prev)} type="button">
 *           {expanded ? 'Hide edits' : 'Show edits'}
 *         </button>
 *       )}
 *       {expanded && expandable && (
 *         <Suspense fallback={<span>Loading edits…</span>}>
 *           <LifecycleEdits event={event} />
 *         </Suspense>
 *       )}
 *     </li>
 *   )
 * }
 * ```
 */
export const useDocumentHistoryEventEdits: <
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  options: UseDocumentHistoryEventEditsOptions<TDataset, TProjectId>,
) => FetcherHookResult<Array<DocumentHistoryEditedEvent | DocumentHistoryCreatedEvent>> =
  withSdkOrigin(useDocumentHistoryEventEditsImpl)
