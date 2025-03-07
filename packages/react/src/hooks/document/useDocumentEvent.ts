import {
  type DocumentEvent,
  type DocumentHandle,
  getResourceId,
  subscribeDocumentEvents,
} from '@sanity/sdk'
import {useCallback, useEffect, useInsertionEffect, useRef} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 *
 * @beta
 *
 * Subscribes an event handler to events in your application’s document store, such as document
 * creation, deletion, and updates.
 *
 * @category Documents
 * @param handler - The event handler to register.
 * @param doc - The document to subscribe to events for. If you pass a `DocumentHandle` with a `resourceId` (in the format of `document:projectId.dataset:documentId`)
 * the document will be read from the specified Sanity project and dataset that is included in the handle. If no `resourceId` is provided, the default project and dataset will be used.
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
  doc: DocumentHandle,
): void {
  const ref = useRef(handler)

  useInsertionEffect(() => {
    ref.current = handler
  })

  const stableHandler = useCallback((documentEvent: DocumentEvent) => {
    return ref.current(documentEvent)
  }, [])

  const instance = useSanityInstance(getResourceId(doc.resourceId))
  useEffect(() => {
    return subscribeDocumentEvents(instance, stableHandler)
  }, [instance, stableHandler])
}
