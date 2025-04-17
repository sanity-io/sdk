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
import {useCallback, useEffect, useState} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useWindowConnection} from './useWindowConnection'

// should we import this whole type from the message protocol?

interface ManageFavorite {
  favorite: () => void
  unfavorite: () => void
  isFavorited: boolean
  isConnected: boolean
}

interface UseManageFavoriteProps extends DocumentHandle {
  resourceId?: string
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  /**
   * The name of the schema collection this document belongs to.
   * Typically is the name of the workspace when used in the context of a studio.
   */
  schemaName?: string
}

/**
 * @internal
 *
 * This hook provides functionality to add and remove documents from favorites,
 * and tracks the current favorite status of the document.
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
  projectId: paramProjectId,
  dataset: paramDataset,
  resourceId: paramResourceId,
  resourceType,
  schemaName,
}: UseManageFavoriteProps): ManageFavorite {
  const [isFavorited, setIsFavorited] = useState<boolean>(false)
  const [status, setStatus] = useState<Status>('idle')
  const [resourceId, setResourceId] = useState<string>(paramResourceId || '')
  const {fetch} = useWindowConnection<Events.FavoriteMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onStatus: setStatus,
  })
  const instance = useSanityInstance()
  const {config} = instance
  const instanceProjectId = config?.projectId
  const instanceDataset = config?.dataset
  const projectId = paramProjectId ?? instanceProjectId
  const dataset = paramDataset ?? instanceDataset

  if (resourceType === 'studio' && (!projectId || !dataset)) {
    throw new Error('projectId and dataset are required for studio resources')
  }

  useEffect(() => {
    if (resourceType === 'studio' && !paramResourceId) {
      setResourceId(`${projectId}.${dataset}`)
    } else if (paramResourceId) {
      setResourceId(paramResourceId)
    } else {
      throw new Error('resourceId is required for media-library and canvas resources')
    }
  }, [resourceType, paramResourceId, projectId, dataset])

  // Fetch the initial state when connected
  useEffect(() => {
    if (status !== 'connected' || !fetch || !documentId || !documentType || !resourceId) {
      return
    }

    const fetchInitialState = async () => {
      try {
        const payload = {
          document: {
            id: documentId,
            type: documentType,
            resource: {
              id: resourceId,
              type: resourceType,
              schemaName,
            },
          },
        }
        const response = await fetch<{isFavorited: boolean}>(
          'dashboard/v1/events/favorite/query',
          payload,
        )
        setIsFavorited(response.isFavorited)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch favorite status:', err)
      }
    }

    fetchInitialState()
  }, [status, fetch, documentId, documentType, resourceId, resourceType, schemaName])

  const handleFavoriteAction = useCallback(
    async (action: 'added' | 'removed') => {
      if (!fetch || !documentId || !documentType || !resourceType) return

      try {
        const payload = {
          eventType: action,
          document: {
            id: documentId,
            type: documentType,
            resource: {
              id: resourceId,
              type: resourceType,
              schemaName,
            },
          },
        }

        const response = await fetch<{success: boolean}>(
          'dashboard/v1/events/favorite/mutate',
          payload,
        )

        if (response.success) {
          setIsFavorited(action === 'added')
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to ${action === 'added' ? 'favorite' : 'unfavorite'} document:`, err)
        throw err
      }
    },
    [fetch, documentId, documentType, resourceId, resourceType, schemaName],
  )

  const favorite = useCallback(() => handleFavoriteAction('added'), [handleFavoriteAction])
  const unfavorite = useCallback(() => handleFavoriteAction('removed'), [handleFavoriteAction])

  return {
    favorite,
    unfavorite,
    isFavorited,
    isConnected: status === 'connected',
  }
}
