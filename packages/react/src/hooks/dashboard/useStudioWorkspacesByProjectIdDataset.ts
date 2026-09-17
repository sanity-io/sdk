/* eslint-disable react-compiler/react-compiler -- the transport branch in `useStudioWorkspacesByProjectIdDataset` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {getApplicationOrigin, isDashboardEnvironment} from '@sanity/sdk/_internal'
import {type TopicData} from '@sanity/sdk/dashboard'
import {useEffect, useMemo, useState} from 'react'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useTopic} from './useTopic'

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

type DashboardApplications = NonNullable<TopicData<'applications.list'>>

/**
 * Hook that fetches studio workspaces and organizes them by projectId:dataset
 *
 * Works in both Dashboard runtimes: it derives workspaces from the `applications.list` message
 * bus topic when a host has installed the bus, and falls back to the Comlink connection otherwise.
 * @internal
 *
 * @example
 * ```tsx
 * import {useStudioWorkspacesByProjectIdDataset} from '@sanity/sdk-react'
 * import {Card, Code, Button} from '@sanity/ui'
 * import {Suspense} from 'react'
 *
 * function WorkspacesCard() {
 *   const {workspacesByProjectIdAndDataset, error} = useStudioWorkspacesByProjectIdDataset()
 *   if (error) {
 *     return <div>Error: {error}</div>
 *   }
 *   return (
 *     <Card padding={4} radius={2} shadow={1}>
 *       <Code language="json">
 *         {JSON.stringify(workspacesByProjectIdAndDataset, null, 2)}
 *       </Code>
 *     </Card>
 *   )
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function DashboardWorkspaces() {
 *   return (
 *     <Suspense fallback={<Button text="Loading..." disabled />}>
 *       <WorkspacesCard />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function useStudioWorkspacesByProjectIdDataset(): StudioWorkspacesResult {
  // The branch is stable: the transport is fixed for the page lifetime, so one set of hooks
  // always runs and the other never does.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  if (isDashboardEnvironment()) return useBusStudioWorkspaces()
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  return useComlinkStudioWorkspaces()
}

// The legacy Comlink protocol models studios at the workspace level, so each workspace of a
// studio's active deployment becomes one resource, addressed by the studio's origin.
function toResources(application: DashboardApplications[number]): DashboardResource[] {
  if (application.type !== 'studio') return []
  const url = getApplicationOrigin(application) ?? ''
  return (application.activeDeployment?.workspaces ?? []).map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    title: workspace.title ?? application.title,
    basePath: workspace.basePath ?? '',
    projectId: workspace.projectId,
    dataset: workspace.dataset,
    type: 'studio',
    userApplicationId: application.id,
    url,
  }))
}

function toWorkspaceMap(applications: DashboardApplications): WorkspacesByProjectIdDataset {
  const workspaceMap: WorkspacesByProjectIdDataset = {}
  for (const resource of applications.flatMap(toResources)) {
    const key = `${resource.projectId}:${resource.dataset}` as const
    workspaceMap[key] ??= []
    workspaceMap[key].push(resource)
  }
  return workspaceMap
}

// Suspends until the host publishes its application list and throws a `TopicError` on failure,
// like every bus hook, so `error` is always `null` on this path.
function useBusStudioWorkspaces(): StudioWorkspacesResult {
  const applications = useTopic('applications.list')
  const workspacesByProjectIdAndDataset = useMemo(
    () => toWorkspaceMap(applications ?? []),
    [applications],
  )
  return {workspacesByProjectIdAndDataset, error: null}
}

function useComlinkStudioWorkspaces(): StudioWorkspacesResult {
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
        }>('dashboard/v1/context', undefined, {signal})

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
