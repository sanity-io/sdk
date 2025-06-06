import {
  type CanvasResource,
  type Events,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

interface DocumentInteractionHistory {
  recordEvent: (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => void
}

/**
 * @internal
 */
interface UseRecordDocumentHistoryEventProps extends DocumentHandle {
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  resourceId?: string
  /**
   * The name of the schema collection this document belongs to.
   * Typically is the name of the workspace when used in the context of a studio.
   */
  schemaName?: string
}

/**
 * @internal
 * Hook for managing document interaction history in Sanity Studio.
 * This hook provides functionality to record document interactions.
 * @category History
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `recordEvent` - Function to record document interactions
 *
 * @example
 * ```tsx
 * import {useRecordDocumentHistoryEvent} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 * import {Suspense} from 'react'
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
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyDocumentAction(props: DocumentActionProps) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <RecordEventButton {...props} />
 *     </Suspense>
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
  const {sendMessage} = useWindowConnection<Events.HistoryMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  if (resourceType !== 'studio' && !resourceId) {
    throw new Error('resourceId is required for media-library and canvas resources')
  }

  const recordEvent = useCallback(
    (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => {
      try {
        const message: Events.HistoryMessage = {
          type: 'dashboard/v1/events/history',
          data: {
            eventType,
            document: {
              id: documentId,
              type: documentType,
              resource: {
                id: resourceId!,
                type: resourceType,
                schemaName,
              },
            },
          },
        }

        sendMessage(message.type, message.data)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to record history event:', error)
        throw error
      }
    },
    [documentId, documentType, resourceId, resourceType, sendMessage, schemaName],
  )

  return {
    recordEvent,
  }
}
