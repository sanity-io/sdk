import {type DatasetHandle, type DocumentEvent, subscribeDocumentEvents} from '@sanity/sdk'
import {useCallback, useEffect, useInsertionEffect, useRef} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 *
 * @beta
 *
 * Subscribes an event handler to events in your application's document store, such as document
 * creation, deletion, and updates.
 *
 * @category Documents
 * @param handler - The event handler to register.
 * @param doc - The document to subscribe to events for. If you pass a `DocumentHandle` with specified `projectId` and `dataset`,
 * the document will be read from the specified Sanity project and dataset that is included in the handle. If no `projectId` or `dataset` is provided,
 * the document will use the nearest instance from context.
 * @example
 * ```
 * import {useDocumentEvent} from '@sanity/sdk-react'
 * import {type DocumentEvent} from '@sanity/sdk'
 *
 * useDocumentEvent((event) => {
 *   if (event.type === DocumentEvent.DocumentDeletedEvent) {
 *     alert(`Document with ID ${event.documentId} deleted!`)
 *   } else {
 *     console.log(event)
 *   }
 * })
 * ```
 */
export function useDocumentEvent(
  handler: (documentEvent: DocumentEvent) => void,
  dataset: DatasetHandle,
): void {
  const ref = useRef(handler)

  useInsertionEffect(() => {
    ref.current = handler
  })

  const stableHandler = useCallback((documentEvent: DocumentEvent) => {
    return ref.current(documentEvent)
  }, [])

  const instance = useSanityInstance(dataset)
  useEffect(() => {
    return subscribeDocumentEvents(instance, stableHandler)
  }, [instance, stableHandler])
}
