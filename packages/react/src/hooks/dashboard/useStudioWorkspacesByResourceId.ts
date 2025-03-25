import {type Status} from '@sanity/comlink'
import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {useEffect, useState} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

interface Workspace {
  name: string
  title: string
  basePath: string
  dataset: string
  userApplicationId: string
  url: string
  _ref: string
}

interface WorkspacesByResourceId {
  [key: string]: Workspace[] // key format: `${projectId}:${dataset}`
}

interface StudioWorkspacesResult {
  workspacesByResourceId: WorkspacesByResourceId
  error: string | null
  isConnected: boolean
}

/**
 * Hook that fetches studio workspaces and organizes them by projectId:dataset
 * @internal
 */
export function useStudioWorkspacesByResourceId(): StudioWorkspacesResult {
  const [workspacesByResourceId, setWorkspacesByResourceId] = useState<WorkspacesByResourceId>({})
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const {fetch} = useWindowConnection({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onStatus: setStatus,
  })

  // Once computed, this should probably be in a store and poll for changes
  // However, our stores are currently being refactored
  useEffect(() => {
    if (!fetch || status !== 'connected') return

    async function fetchWorkspaces(signal: AbortSignal) {
      try {
        const data = await fetch<{
          context: {availableResources: Array<{projectId: string; workspaces: Workspace[]}>}
        }>('dashboard/v1/bridge/context', undefined, {signal})

        const workspaceMap: WorkspacesByResourceId = {}

        data.context.availableResources.forEach((resource) => {
          if (!resource.projectId || !resource.workspaces?.length) return

          resource.workspaces.forEach((workspace) => {
            const key = `${resource.projectId}:${workspace.dataset}`
            if (!workspaceMap[key]) {
              workspaceMap[key] = []
            }
            workspaceMap[key].push(workspace)
          })
        })

        setWorkspacesByResourceId(workspaceMap)
        setError(null)
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.name === 'AbortError') {
            return
          }
          setError('Failed to fetch workspaces')
        }
      }
    }

    const controller = new AbortController()
    fetchWorkspaces(controller.signal)

    return () => {
      controller.abort()
    }
  }, [fetch, status])

  return {
    workspacesByResourceId,
    error,
    isConnected: status === 'connected',
  }
}
