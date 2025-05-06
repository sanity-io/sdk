import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {useEffect, useState} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'

export interface DashboardResource {
  id: string
  name: string
  title: string
  basePath: string
  projectId: string
  dataset: string
  type: string
  userApplicationId: string
  url: string
}

interface WorkspacesByProjectIdDataset {
  [key: `${string}:${string}`]: DashboardResource[] // key format: `${projectId}:${dataset}`
}

interface StudioWorkspacesResult {
  workspacesByProjectIdAndDataset: WorkspacesByProjectIdDataset
  error: string | null
}

/**
 * Hook that fetches studio workspaces and organizes them by projectId:dataset
 * @internal
 */
export function useStudioWorkspacesByProjectIdDataset(): StudioWorkspacesResult {
  const [workspacesByProjectIdAndDataset, setWorkspacesByProjectIdAndDataset] =
    useState<WorkspacesByProjectIdDataset>({})
  const [error, setError] = useState<string | null>(null)

  const {fetch} = useWindowConnection({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  // Once computed, this should probably be in a store and poll for changes
  // However, our stores are currently being refactored
  useEffect(() => {
    if (!fetch) return

    async function fetchWorkspaces(signal: AbortSignal) {
      try {
        const data = await fetch<{
          context: {availableResources: Array<DashboardResource>}
        }>('dashboard/v1/bridge/context', undefined, {signal})

        const workspaceMap: WorkspacesByProjectIdDataset = {}
        const noProjectIdAndDataset: DashboardResource[] = []

        data.context.availableResources.forEach((resource) => {
          if (resource.type !== 'studio') return
          if (!resource.projectId || !resource.dataset) {
            noProjectIdAndDataset.push(resource)
            return
          }
          const key = `${resource.projectId}:${resource.dataset}` as const
          if (!workspaceMap[key]) {
            workspaceMap[key] = []
          }
          workspaceMap[key].push(resource)
        })

        if (noProjectIdAndDataset.length > 0) {
          workspaceMap['NO_PROJECT_ID:NO_DATASET'] = noProjectIdAndDataset
        }

        setWorkspacesByProjectIdAndDataset(workspaceMap)
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
  }, [fetch])

  return {
    workspacesByProjectIdAndDataset,
    error,
  }
}
