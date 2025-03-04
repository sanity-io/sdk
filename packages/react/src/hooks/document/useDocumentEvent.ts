import {type DatasetResourceId, type DocumentEvent, getDocumentStore} from '@sanity/sdk'
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
  datasetResourceId: DatasetResourceId,
  handler: (documentEvent: DocumentEvent) => void,
): void {
  const ref = useRef(handler)

  useInsertionEffect(() => {
    ref.current = handler
  })

  const stableHandler = useCallback((documentEvent: DocumentEvent) => {
    return ref.current(documentEvent)
  }, [])

  const instance = useSanityInstance()
  useEffect(() => {
    const store = getDocumentStore(instance, datasetResourceId)
    return store.subscribeDocumentEvents(stableHandler)
  }, [instance, datasetResourceId, stableHandler])
}
