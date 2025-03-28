import {type Status} from '@sanity/comlink'
import {
  type CanvasResource,
  type Events,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback, useState} from 'react'

import {useWindowConnection} from './useWindowConnection'

interface DocumentInteractionHistory {
  recordEvent: (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => void
  isConnected: boolean
}

/**
 * @public
 */
interface UseRecordDocumentHistoryEventProps extends DocumentHandle {
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  resourceId?: string
}

/**
 * @public
 * Hook for managing document interaction history in Sanity Studio.
 * This hook provides functionality to record document interactions.
 * @category History
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `recordEvent` - Function to record document interactions
 * - `isConnected` - Boolean indicating if connection to Studio is established
 *
 * @example
 * ```tsx
 * function MyDocumentAction(props: DocumentActionProps) {
 *   const {documentId, documentType, resourceType, resourceId} = props
 *   const {recordEvent, isConnected} = useRecordDocumentHistoryEvent({
 *     documentId,
 *     documentType,
 *     resourceType,
 *     resourceId,
 *   })
 *
 *   return (
 *     <Button
 *       disabled={!isConnected}
 *       onClick={() => recordEvent('viewed')}
 *       text={'Viewed'}
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
}: UseRecordDocumentHistoryEventProps): DocumentInteractionHistory {
  const [status, setStatus] = useState<Status>('idle')
  const {sendMessage} = useWindowConnection<Events.HistoryMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onStatus: setStatus,
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
            documentId,
            documentType,
            resourceType,
            resourceId: resourceId!,
          },
        }

        sendMessage(message.type, message.data)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to record history event:', error)
        throw error
      }
    },
    [documentId, documentType, resourceId, resourceType, sendMessage],
  )

  return {
    recordEvent,
    isConnected: status === 'connected',
  }
}
