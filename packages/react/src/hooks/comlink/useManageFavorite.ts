import {type Status} from '@sanity/comlink'
import {type Events, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle, type FrameMessage} from '@sanity/sdk'
import {useCallback, useState} from 'react'

import {useWindowConnection} from './useWindowConnection'

// should we import this whole type from the message protocol?

interface ManageFavorite {
  favorite: () => void
  unfavorite: () => void
  isFavorited: boolean
  isConnected: boolean
}

/**
 * @beta
 *
 * ## useManageFavorite
 * This hook provides functionality to add and remove documents from favorites,
 * and tracks the current favorite status of the document.
 * @category Core UI Communication
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `favorite` - Function to add document to favorites
 * - `unfavorite` - Function to remove document from favorites
 * - `isFavorited` - Boolean indicating if document is currently favorited
 * - `isConnected` - Boolean indicating if connection to Core UI is established
 *
 * @example
 * ```tsx
 * function MyDocumentAction(props: DocumentActionProps) {
 *   const {_id, _type} = props
 *   const {favorite, unfavorite, isFavorited, isConnected} = useManageFavorite({
 *     _id,
 *     _type
 *   })
 *
 *   return (
 *     <Button
 *       disabled={!isConnected}
 *       onClick={() => isFavorited ? unfavorite() : favorite()}
 *       text={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
 *     />
 *   )
 * }
 * ```
 */
export function useManageFavorite({_id, _type}: DocumentHandle): ManageFavorite {
  const [isFavorited, setIsFavorited] = useState(false) // should load this from a comlink fetch
  const [status, setStatus] = useState<Status>('idle')
  const {sendMessage} = useWindowConnection<Events.FavoriteMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onStatus: setStatus,
  })

  const handleFavoriteAction = useCallback(
    (action: 'added' | 'removed', setFavoriteState: boolean) => {
      if (!_id || !_type) return

      try {
        const message: Events.FavoriteMessage = {
          type: 'dashboard/v1/events/favorite',
          data: {
            eventType: action,
            documentId: _id,
            documentType: _type,
          },
        }

        sendMessage(message.type, message.data)
        setIsFavorited(setFavoriteState)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update favorite status')
        // eslint-disable-next-line no-console
        console.error(
          `Failed to ${action === 'added' ? 'favorite' : 'unfavorite'} document:`,
          error,
        )
        throw error
      }
    },
    [_id, _type, sendMessage],
  )

  const favorite = useCallback(() => handleFavoriteAction('added', true), [handleFavoriteAction])

  const unfavorite = useCallback(
    () => handleFavoriteAction('removed', false),
    [handleFavoriteAction],
  )

  return {
    favorite,
    unfavorite,
    isFavorited,
    isConnected: status === 'connected',
  }
}
