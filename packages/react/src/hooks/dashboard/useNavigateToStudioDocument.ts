import {type Bridge, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle} from '@sanity/sdk'
import {useCallback} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {
  type DashboardResource,
  useStudioWorkspacesByProjectIdDataset,
} from './useStudioWorkspacesByProjectIdDataset'

/**
 * @public
 * @category Types
 */
export interface NavigateToStudioResult {
  navigateToStudioDocument: () => void
}

/**
 * @public
 *
 * Hook that provides a function to navigate to a given document in its parent Studio.
 *
 * Uses the `projectId` and `dataset` properties of the {@link DocumentHandle} you provide to resolve the correct Studio.
 * This will only work if you have deployed a studio with a workspace with this `projectId` / `dataset` combination.
 *
 * @remarks If you write your own Document Handle to pass to this hook (as opposed to a Document Handle generated by another hook),
 * it must include values for `documentId`, `documentType`, `projectId`, and `dataset`.
 *
 * @category Documents
 * @param documentHandle - The document handle for the document to navigate to
 * @param preferredStudioUrl - The preferred studio url to navigate to if you have multiple
 * studios with the same projectId and dataset
 * @returns An object containing:
 * - `navigateToStudioDocument` - Function that when called will navigate to the studio document
 *
 * @example
 * ```tsx
 * import {useNavigateToStudioDocument, type DocumentHandle} from '@sanity/sdk-react'
 * import {Button} from '@sanity/ui'
 * import {Suspense} from 'react'
 *
 * function NavigateButton({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const {navigateToStudioDocument} = useNavigateToStudioDocument(documentHandle)
 *   return (
 *     <Button
 *       onClick={navigateToStudioDocument}
 *       text="Navigate to Studio Document"
 *     />
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyDocumentAction({documentHandle}: {documentHandle: DocumentHandle}) {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <NavigateButton documentHandle={documentHandle} />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function useNavigateToStudioDocument(
  documentHandle: DocumentHandle,
  preferredStudioUrl?: string,
): NavigateToStudioResult {
  const {workspacesByProjectIdAndDataset} = useStudioWorkspacesByProjectIdDataset()
  const {sendMessage} = useWindowConnection<Bridge.Navigation.NavigateToResourceMessage, never>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const navigateToStudioDocument = useCallback(() => {
    const {projectId, dataset} = documentHandle

    if (!projectId || !dataset) {
      // eslint-disable-next-line no-console
      console.warn('Project ID and dataset are required to navigate to a studio document')
      return
    }

    let workspace: DashboardResource | undefined

    if (preferredStudioUrl) {
      // Get workspaces matching the projectId:dataset and any workspaces without projectId/dataset,
      // in case there hasn't been a manifest loaded yet
      const allWorkspaces = [
        ...(workspacesByProjectIdAndDataset[`${projectId}:${dataset}`] || []),
        ...(workspacesByProjectIdAndDataset['NO_PROJECT_ID:NO_DATASET'] || []),
      ]
      workspace = allWorkspaces.find((w) => w.url === preferredStudioUrl)
    } else {
      const workspaces = workspacesByProjectIdAndDataset[`${projectId}:${dataset}`]
      if (workspaces?.length > 1) {
        // eslint-disable-next-line no-console
        console.warn(
          'Multiple workspaces found for document and no preferred studio url',
          documentHandle,
        )
        // eslint-disable-next-line no-console
        console.warn('Using the first one', workspaces[0])
      }

      workspace = workspaces?.[0]
    }

    if (!workspace) {
      // eslint-disable-next-line no-console
      console.warn(
        `No workspace found for document with projectId: ${projectId} and dataset: ${dataset}${preferredStudioUrl ? ` or with preferred studio url: ${preferredStudioUrl}` : ''}`,
      )
      return
    }

    const message: Bridge.Navigation.NavigateToResourceMessage = {
      type: 'dashboard/v1/bridge/navigate-to-resource',
      data: {
        resourceId: workspace.id,
        resourceType: 'studio',
        path: `/intent/edit/id=${documentHandle.documentId};type=${documentHandle.documentType}`,
      },
    }

    sendMessage(message.type, message.data)
  }, [documentHandle, workspacesByProjectIdAndDataset, sendMessage, preferredStudioUrl])

  return {
    navigateToStudioDocument,
  }
}
