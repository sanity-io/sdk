import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback} from 'react'

import {useWindowConnection} from './useWindowConnection'

// should we import this whole type from the message protocol?
interface HistoryMessage {
  type: 'HISTORY_UPDATE'
  data: {
    version: string
    eventType: 'viewed' | 'edited' | 'created' | 'deleted'
    documentId: string
    documentType: string
  }
}

interface DocumentInteractionHistory {
  recordEvent: (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => void
  isConnected: boolean
}

/**
 * @public
 * Hook for managing document interaction history in Sanity Studio.
 * This hook provides functionality to record document interactions.
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `recordEvent` - Function to record document interactions
 * - `isConnected` - Boolean indicating if connection to Studio is established
 *
 * @example
 * ```tsx
 * function MyDocumentAction(props: DocumentActionProps) {
 *   const {_id, _type} = props
 *   const {recordEvent, isConnected} = useDocumentInteractionHistory({
 *     _id,
 *     _type
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
export function useDocumentInteractionHistory({
  _id,
  _type,
}: DocumentHandle): DocumentInteractionHistory {
  const {sendMessage, status} = useWindowConnection<HistoryMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const recordEvent = useCallback(
    (eventType: 'viewed' | 'edited' | 'created' | 'deleted') => {
      try {
        const message: HistoryMessage = {
          type: 'HISTORY_UPDATE',
          data: {
            version: '1', // Should we import this from the message protocol?
            eventType,
            documentId: _id,
            documentType: _type,
          },
        }

        sendMessage(message.type, message.data)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to record history event:', error)
        throw error
      }
    },
    [_id, _type, sendMessage],
  )

  return {
    recordEvent,
    isConnected: status === 'connected',
  }
}
