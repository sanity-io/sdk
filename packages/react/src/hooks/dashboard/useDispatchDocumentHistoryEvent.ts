import {
  type CanvasResource,
  type Events,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {type FrameMessage} from '@sanity/sdk/comlink'
import {useCallback} from 'react'

import {type DocumentHandle} from '../../config/handles'
import {useWindowConnection} from '../comlink/useWindowConnection'

interface DocumentHistoryEventDispatcher {
  dispatchHistoryEvent: (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => void
}

/**
 * @internal
 */
interface UseDispatchDocumentHistoryEventProps extends DocumentHandle {
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
 * This hook provides functionality to dispatch document history events.
 * @category History
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `dispatchHistoryEvent` - Function to dispatch document history events
 *
 * @example
 * ```tsx
 * import {useDispatchDocumentHistoryEvent} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 * import {Suspense} from 'react'
 *
 * function DispatchEventButton(props: DocumentActionProps) {
 *   const {documentId, documentType, resourceType, resourceId} = props
 *   const {dispatchHistoryEvent} = useDispatchDocumentHistoryEvent({
 *     documentId,
 *     documentType,
 *     resourceType,
 *     resourceId,
 *   })
 *   return (
 *     <Button
 *       onClick={() => dispatchHistoryEvent('viewed')}
 *       text="Viewed"
 *     />
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyDocumentAction(props: DocumentActionProps) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <DispatchEventButton {...props} />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function useDispatchDocumentHistoryEvent({
  documentId,
  documentType,
  resourceType,
  resourceId,
  schemaName,
}: UseDispatchDocumentHistoryEventProps): DocumentHistoryEventDispatcher {
  const {sendMessage} = useWindowConnection<Events.HistoryMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  if (resourceType !== 'studio' && !resourceId) {
    throw new Error('resourceId is required for media-library and canvas resources')
  }

  const dispatchHistoryEvent = useCallback(
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
        console.error('Failed to dispatch history event:', error)
        throw error
      }
    },
    [documentId, documentType, resourceId, resourceType, sendMessage, schemaName],
  )

  return {
    dispatchHistoryEvent,
  }
}
