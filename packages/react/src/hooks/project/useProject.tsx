import {type SanityProject} from '@sanity/client'
import {getProject, getProjectState} from '@sanity/sdk'
import {useCallback, useEffect, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * React hook that fetches and subscribes to changes for a specific Sanity project.
 *
 * This hook implements a stale-while-revalidate caching strategy and integrates with
 * React Suspense for loading states.
 *
 * @public
 *
 * @param projectId - The ID of the Sanity project to fetch
 * @returns The Sanity project data
 *
 * @throws Promise when the project is not yet loaded for React Suspense
 *
 * @example
 * ```tsx
 * // Basic usage with Suspense
 * function ProjectDetails({ projectId }: { projectId: string }) {
 *   const project = useProject(projectId)
 *
 *   return (
 *     <div>
 *       <h1>{project.displayName}</h1>
 *       <p>Dataset: {project.dataset}</p>
 *     </div>
 *   )
 * }
 *
 * // Wrap in Suspense when using
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading project...</div>}>
 *       <ProjectDetails projectId="your-project-id" />
 *     </Suspense>
 *   )
 * }
 * ```
 *
 * @remarks
 * - The hook automatically subscribes to project updates and re-renders when changes occur
 * - Initial data is loaded through Suspense
 * - Implements stale-while-revalidate: shows cached data while refreshing in background
 */
export function useProject(projectId: string): SanityProject {
  const instance = useSanityInstance()
  const {projects, subscribe} = getProjectState(instance)
  const project = projects.find((p) => p.id === projectId)

  const getSnapshot = useCallback(() => {
    const currentState = getProjectState(instance)
    const currentProject = currentState.projects.find((p) => p.id === projectId)

    // If we don't have the project yet, throw promise for Suspense
    if (!currentProject) {
      throw getProject(instance, projectId)
    }

    return currentProject
  }, [instance, projectId])

  // Implement stale-while-revalidate behavior
  useEffect(() => {
    // Skip initial load since Suspense handles that
    if (project) {
      getProject(instance, projectId, true).catch(() => {
        // Error handling is done in the store
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, projectId])

  return useSyncExternalStore(subscribe, getSnapshot)
}
