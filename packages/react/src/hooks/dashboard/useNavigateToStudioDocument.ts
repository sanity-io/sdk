import {type Status} from '@sanity/comlink'
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
 * @param documentHandle - The document handle containing document ID, type, and resource ID
 * @returns An object containing:
 * - navigateToStudioDocument - Function that when called will navigate to the studio document
 * - isConnected - Boolean indicating if connection to Core UI is established
 */
export function useNavigateToStudioDocument(
  documentHandle: DocumentHandle,
): NavigateToStudioResult {
  const {workspacesByResourceId, isConnected: workspacesConnected} =
    useStudioWorkspacesByResourceId()
  const [status, setStatus] = useState<Status>('idle')
  const {sendMessage} = useWindowConnection<NavigateToResourceMessage, never>({
    name: 'core/nodes/sdk',
    connectTo: 'core/channels/sdk',
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
