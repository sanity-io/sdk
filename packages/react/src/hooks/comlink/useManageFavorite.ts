import {type Status} from '@sanity/comlink'
import {
  type CanvasResource,
  type Events,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {type FrameMessage} from '@sanity/sdk'
import {useCallback, useState} from 'react'

import {useWindowConnection} from './useWindowConnection'

// should we import this whole type from the message protocol?

interface ManageFavorite {
  favorite: () => void
  unfavorite: () => void
  isFavorited: boolean
  isConnected: boolean
}

interface UseManageFavoriteProps {
  documentId: string
  documentType: string
  resourceId?: string
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
}

/**
 * @beta
 *
 * ## useManageFavorite
 * This hook provides functionality to add and remove documents from favorites,
 * and tracks the current favorite status of the document.
 * @category Dashboard Communication
 * @param documentHandle - The document handle containing document ID and type, like `{_id: '123', _type: 'book'}`
 * @returns An object containing:
 * - `favorite` - Function to add document to favorites
 * - `unfavorite` - Function to remove document from favorites
 * - `isFavorited` - Boolean indicating if document is currently favorited
 * - `isConnected` - Boolean indicating if connection to Dashboard UI is established
 *
 * @example
 * ```tsx
 * function MyDocumentAction(props: DocumentActionProps) {
 *   const {documentId, documentType} = props
 *   const {favorite, unfavorite, isFavorited, isConnected} = useManageFavorite({
 *     documentId,
 *     documentType
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
export function useManageFavorite({
  documentId,
  documentType,
  resourceId,
  resourceType,
}: UseManageFavoriteProps): ManageFavorite {
  const [isFavorited, setIsFavorited] = useState(false) // should load this from a comlink fetch
  const [status, setStatus] = useState<Status>('idle')
  const {sendMessage} = useWindowConnection<Events.FavoriteMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onStatus: setStatus,
  })

  if (resourceType !== 'studio' && !resourceId) {
    throw new Error('resourceId is required for media-library and canvas resources')
  }

  const handleFavoriteAction = useCallback(
    (action: 'added' | 'removed', setFavoriteState: boolean) => {
      if (!documentId || !documentType || !resourceType) return

      try {
        const message: Events.FavoriteMessage = {
          type: 'dashboard/v1/events/favorite/mutate',
          data: {
            eventType: action,
            documentId,
            documentType,
            resourceType,
            // Resource Id should exist for media-library and canvas resources
            resourceId: resourceId!,
          },
          response: {
            success: true,
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
    [documentId, documentType, resourceId, resourceType, sendMessage],
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
