import {type DatasetHandle, type DocumentEvent, subscribeDocumentEvents} from '@sanity/sdk'
import {useCallback, useEffect, useInsertionEffect, useRef} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @beta
 */
export interface UseDocumentEventOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DatasetHandle<TDataset, TProjectId> {
  onEvent: (documentEvent: DocumentEvent) => void
}

/**
 *
 * @beta
 *
 * Subscribes an event handler to events in your application's document store.
 *
 * @category Documents
 * @param options - An object containing the event handler (`onEvent`) and optionally a `DatasetHandle` (projectId and dataset). If the handle is not provided, the nearest Sanity instance from context will be used.
 * @example Creating a custom hook for document event toasts
 * ```tsx
 * import {createDatasetHandle, type DatasetHandle, type DocumentEvent, useDocumentEvent} from '@sanity/sdk-react'
 * import {useToast} from './my-ui-library'
 *
 * // Define options for the custom hook, extending DatasetHandle
 * interface DocumentToastsOptions extends DatasetHandle {
 *   // Could add more options, e.g., { includeEvents: DocumentEvent['type'][] }
 * }
 *
 * // Define the custom hook
 * function useDocumentToasts({...datasetHandle}: DocumentToastsOptions = {}) {
 *   const showToast = useToast() // Get the toast function
 *
 *   // Define the event handler logic to show toasts on specific events
 *   const handleEvent = (event: DocumentEvent) => {
 *     if (event.type === 'published') {
 *       showToast(`Document ${event.documentId} published.`)
 *     } else if (event.type === 'unpublished') {
 *       showToast(`Document ${event.documentId} unpublished.`)
 *     } else if (event.type === 'deleted') {
 *       showToast(`Document ${event.documentId} deleted.`)
 *     } else {
 *       // Optionally log other events for debugging
 *       console.log('Document Event:', event.type, event.documentId)
 *     }
 *   }
 *
 *   // Call the original hook, spreading the handle properties
 *   useDocumentEvent({
 *     ...datasetHandle, // Spread the dataset handle (projectId, dataset)
 *     onEvent: handleEvent,
 *   })
 * }
 *
 * function MyComponentWithToasts() {
 *   // Use the custom hook, passing specific handle info
 *   const specificHandle = createDatasetHandle({ projectId: 'p1', dataset: 'ds1' })
 *   useDocumentToasts(specificHandle)
 *
 *   // // Or use it relying on context for the handle
 *   // useDocumentToasts()
 *
 *   return <div>...</div>
 * }
 * ```
 */
export function useDocumentEvent<
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  // Single options object parameter
  options: UseDocumentEventOptions<TDataset, TProjectId>,
): void {
  // Destructure handler and datasetHandle from options
  const {onEvent, ...datasetHandle} = options
  const ref = useRef(onEvent)

  useInsertionEffect(() => {
    ref.current = onEvent
  })

  const stableHandler = useCallback((documentEvent: DocumentEvent) => {
    return ref.current(documentEvent)
  }, [])

  const instance = useSanityInstance(datasetHandle)
  useEffect(() => {
    return subscribeDocumentEvents(instance, stableHandler)
  }, [instance, stableHandler])
}
