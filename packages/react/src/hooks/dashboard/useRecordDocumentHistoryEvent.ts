import {
  type CanvasResource,
  type MediaResource,
  type StudioResource,
} from '@sanity/message-protocol'
import {type DocumentHandle, recordDocumentHistoryEvent} from '@sanity/sdk'
import {isDashboardEnvironment} from '@sanity/sdk/_internal'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

interface DocumentInteractionHistory {
  recordEvent: (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => void
}

/**
 * @internal
 */
interface UseRecordDocumentHistoryEventProps extends DocumentHandle {
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  /**
   * The resource the document lives in. Optional for studios over Comlink, where the iframe
   * host fills it from context; always required under the message bus, which has no such
   * context and throws when it is missing.
   */
  resourceId?: string
  /**
   * The name of the schema collection this document belongs to.
   * Typically is the name of the workspace when used in the context of a studio.
   */
  schemaName?: string
}

/**
 * @internal
 * Hook for recording document interaction history in a Dashboard application.
 * This hook provides functionality to record document interactions.
 *
 * It works in both Dashboard runtimes and picks the transport for the current one when an event
 * is recorded:
 *
 * | Runtime | Transport | `resourceId` |
 * | --- | --- | --- |
 * | iframe | Comlink | optional for studios |
 * | federated | message bus | required |
 *
 * The hook does not suspend. Events recorded before the Comlink node connects are sent once it
 * connects. Under the message bus they wait up to 5 seconds for the host to publish its
 * capabilities, and are dropped when the host does not provide `history` or the capabilities
 * cannot be read in that time.
 *
 * @category History
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `recordEvent` - Function to record document interactions
 *
 * @example
 * ```tsx
 * import {useRecordDocumentHistoryEvent} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 *
 * function RecordEventButton(props: DocumentActionProps) {
 *   const {documentId, documentType, resourceType, resourceId} = props
 *   const {recordEvent} = useRecordDocumentHistoryEvent({
 *     documentId,
 *     documentType,
 *     resourceType,
 *     resourceId,
 *   })
 *   return (
 *     <Button
 *       onClick={() => recordEvent('viewed')}
 *       text="Viewed"
 *     />
 *   )
 * }
 * ```
 */
export function useRecordDocumentHistoryEvent({
  documentId,
  documentType,
  resourceType,
  resourceId,
  schemaName,
}: UseRecordDocumentHistoryEventProps): DocumentInteractionHistory {
  const instance = useSanityInstance()

  if (!resourceId) {
    // The bus host has no iframe context to fill `projectId.dataset` from.
    if (isDashboardEnvironment()) {
      throw new Error('resourceId is required to record document history under the message bus')
    }
    if (resourceType !== 'studio') {
      throw new Error('resourceId is required for media-library and canvas resources')
    }
  }

  const recordEvent = useCallback(
    (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => {
      recordDocumentHistoryEvent(instance, {
        eventType,
        documentId,
        documentType,
        resourceType,
        resourceId,
        schemaName,
      }).subscribe({
        error: (error) => {
          // eslint-disable-next-line no-console
          console.error('Failed to record history event:', error)
        },
      })
    },
    [instance, documentId, documentType, resourceType, resourceId, schemaName],
  )

  return {recordEvent}
}
