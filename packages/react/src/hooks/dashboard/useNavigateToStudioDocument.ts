import {type Status} from '@sanity/comlink'
import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {type DocumentHandle} from '@sanity/sdk'
import {useCallback, useState} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useStudioWorkspacesByResourceId} from './useStudioWorkspacesByResourceId'

interface NavigateToResourceMessage {
  type: 'core/v1/bridge/navigate-to-resource'
  data: {
    /**
     * Resource ID
     */
    resourceId: string
    /**
     * Resource type
     * @example 'application' | 'studio'
     */
    resourceType: string
    /**
     * Path within the resource to navigate to.
     */
    path?: string
  }
}

interface NavigateToStudioResult {
  navigateToStudioDocument: () => void
  isConnected: boolean
}

/**
 * @public
 * Hook that provides a function to navigate to a studio document.
 * Currently, requires a document handle with a resourceId.
 * That resourceId is currently formatted like: `document:projectId.dataset:documentId`
 * If the hook you used to retrieve the document handle doesn't provide a resourceId like this,
 * you can construct it according to the above format with the document handle's _id.
 *
 * This will only work if you have deployed a studio with a workspace
 * with this projectId / dataset combination.
 * It may be able to take a custom URL in the future.
 *
 * This will likely change in the future.
 * @param documentHandle - The document handle containing document ID, type, and resource ID
 * @returns An object containing:
 * - navigateToStudioDocument - Function that when called will navigate to the studio document
 * - isConnected - Boolean indicating if connection to Dashboard is established
 *
 * @example
 * ```ts
 * import {navigateToStudioDocument, type DocumentHandle} from '@sanity/sdk'
 *
 * function MyComponent({documentHandle}: {documentHandle: DocumentHandle}) {
 *   const {navigateToStudioDocument, isConnected} = useNavigateToStudioDocument(documentHandle)
 *
 *   return (
 *     <button onClick={navigateToStudioDocument} disabled={!isConnected}>
 *       Navigate to Studio Document
 *     </button>
 *   )
 * }
 * ```
 */
export function useNavigateToStudioDocument(
  documentHandle: DocumentHandle,
): NavigateToStudioResult {
  const {workspacesByResourceId, isConnected: workspacesConnected} =
    useStudioWorkspacesByResourceId()
  const [status, setStatus] = useState<Status>('idle')
  const {sendMessage} = useWindowConnection<NavigateToResourceMessage, never>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onStatus: setStatus,
  })

  const navigateToStudioDocument = useCallback(() => {
    if (!workspacesConnected || status !== 'connected' || !documentHandle.resourceId) {
      return
    }

    // Extract projectId and dataset from the resourceId (current format: document:projectId.dataset:documentId)
    const [, projectAndDataset] = documentHandle.resourceId.split(':')
    const [projectId, dataset] = projectAndDataset.split('.')
    if (!projectId || !dataset) {
      return
    }

    // Find the workspace for this document
    const workspaces = workspacesByResourceId[`${projectId}:${dataset}`]
    if (!workspaces?.length) {
      // eslint-disable-next-line no-console
      console.warn('No workspace found for document', documentHandle.resourceId)
      return
    }

    if (workspaces.length > 1) {
      // eslint-disable-next-line no-console
      console.warn('Multiple workspaces found for document', documentHandle.resourceId)
      // eslint-disable-next-line no-console
      console.warn('Using the first one', workspaces[0])
    }

    const workspace = workspaces[0]

    const message: NavigateToResourceMessage = {
      type: 'core/v1/bridge/navigate-to-resource',
      data: {
        resourceId: workspace._ref,
        resourceType: 'studio',
        path: `/intent/edit/id=${documentHandle._id};type=${documentHandle._type}`,
      },
    }

    sendMessage(message.type, message.data)
  }, [documentHandle, workspacesConnected, status, sendMessage, workspacesByResourceId])

  return {
    navigateToStudioDocument,
    isConnected: workspacesConnected && status === 'connected',
  }
}
