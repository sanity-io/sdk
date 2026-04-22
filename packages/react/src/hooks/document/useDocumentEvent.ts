import {type DocumentEvent, onDocumentEvent} from '@sanity/sdk'
import {useCallback, useEffect, useInsertionEffect, useRef} from 'react'

import {type ResourceHandle} from '../../config/handles'
import {useSanityInstance} from '../context/useSanityInstance'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'
import {useTrackHookUsage} from '../helpers/useTrackHookUsage'

/**
 * @public
 */
export interface UseDocumentEventOptions<
  TDataset extends string = string,
  TProjectId extends string = string,
> extends ResourceHandle<TProjectId, TDataset> {
  onEvent: (documentEvent: DocumentEvent) => void
}

/**
 *
 * @public
 *
 * Subscribes an event handler to events in your application's document store.
 *
 * @category Documents
 * @param options - An object containing the event handler (`onEvent`) and optionally a `resource`. If no resource is provided, the nearest resource from context will be used.
 * @example Creating a custom hook for document event toasts
 * ```tsx
 * import {type DocumentResource, type DocumentEvent, useDocumentEvent} from '@sanity/sdk-react'
 * import {useToast} from './my-ui-library'
 *
 * // Define options for the custom hook
 * interface DocumentToastsOptions {
 *   resource?: DocumentResource
 * }
 *
 * // Define the custom hook
 * function useDocumentToasts({resource}: DocumentToastsOptions = {}) {
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
 *       console.log('Document Event:', event.type, event.documentId)
 *     }
 *   }
 *
 *   useDocumentEvent({
 *     resource,
 *     onEvent: handleEvent,
 *   })
 * }
 *
 * function MyComponentWithToasts() {
 *   useDocumentToasts({resource: {projectId: 'p1', dataset: 'ds1'}})
 *
 *   // Or rely on context for the resource:
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
  useTrackHookUsage('useDocumentEvent')
  // Destructure handler and datasetHandle from options
  const normalizedOptions = useNormalizedResourceOptions(options)
  const {onEvent, ...datasetHandle} = normalizedOptions
  const ref = useRef(onEvent)

  useInsertionEffect(() => {
    ref.current = onEvent
  })

  const stableHandler = useCallback((documentEvent: DocumentEvent) => {
    return ref.current(documentEvent)
  }, [])

  const instance = useSanityInstance()
  useEffect(() => {
    return onDocumentEvent(instance, {
      eventHandler: stableHandler,
      resource: datasetHandle.resource,
    })
  }, [instance, datasetHandle.resource, stableHandler])
}
