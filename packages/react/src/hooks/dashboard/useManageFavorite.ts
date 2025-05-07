import {
  type CanvasResource,
  type Events,
  type MediaResource,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
  type StudioResource,
} from '@sanity/message-protocol'
import {
  type DocumentHandle,
  type FavoriteStatusResponse,
  type FrameMessage,
  getFavoritesState,
  resolveFavoritesState,
} from '@sanity/sdk'
import {useCallback, useMemo, useSyncExternalStore} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useSanityInstance} from '../context/useSanityInstance'

interface ManageFavorite extends FavoriteStatusResponse {
  favorite: () => Promise<void>
  unfavorite: () => Promise<void>
  isFavorited: boolean
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
 * function FavoriteButton(props: DocumentActionProps) {
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
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyDocumentAction(props: DocumentActionProps) {
 *   return (
 *     <Suspense
 *       fallback={
 *         <Button
 *           text="Loading..."
 *           disabled
 *         />
 *       }
 *     >
 *       <FavoriteButton {...props} />
 *     </Suspense>
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
  const {fetch} = useWindowConnection<Events.FavoriteMessage, FrameMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
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
  // Compute the final resourceId
  const resourceId =
    resourceType === 'studio' && !paramResourceId ? `${projectId}.${dataset}` : paramResourceId

  if (!resourceId) {
    throw new Error('resourceId is required for media-library and canvas resources')
  }

  // used for favoriteStore functions like getFavoritesState and resolveFavoritesState
  const context = useMemo(
    () => ({
      documentId,
      documentType,
      resourceId,
      resourceType,
      schemaName,
    }),
    [documentId, documentType, resourceId, resourceType, schemaName],
  )

  // Get favorite status using StateSource
  const favoriteState = getFavoritesState(instance, context)
  const state = useSyncExternalStore(favoriteState.subscribe, favoriteState.getCurrent)

  const isFavorited = state?.isFavorited ?? false

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
              ...{
                id: resourceId,
                type: resourceType,
              },
              ...(schemaName ? {schemaName} : {}),
            },
          },
        }

        const res = await fetch<{success: boolean}>('dashboard/v1/events/favorite/mutate', payload)
        if (res.success) {
          // Force a re-fetch of the favorite status after successful mutation
          await resolveFavoritesState(instance, context)
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`Failed to ${action === 'added' ? 'favorite' : 'unfavorite'} document:`, err)
        throw err
      }
    },
    [fetch, documentId, documentType, resourceId, resourceType, schemaName, instance, context],
  )

  const favorite = useCallback(() => handleFavoriteAction('added'), [handleFavoriteAction])
  const unfavorite = useCallback(() => handleFavoriteAction('removed'), [handleFavoriteAction])

  return {
    favorite,
    unfavorite,
    isFavorited,
  }
}
