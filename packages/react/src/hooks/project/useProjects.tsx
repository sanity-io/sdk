import {type SanityProject} from '@sanity/client'
import {getProjects, getProjectState} from '@sanity/sdk'
import {useCallback, useEffect, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * React hook that provides access to Sanity projects associated with the current instance.
 *
 * This hook implements a stale-while-revalidate caching strategy and integrates with React Suspense
 * for loading states. It will automatically fetch projects when mounted and keep the data in sync
 * with the server.
 *
 * @public
 *
 * @returns An array of Sanity projects
 *
 * @throws Promise when projects are being loaded initially, throws a promise for React Suspense
 *
 * @example
 * ```tsx
 * // Basic usage
 * function ProjectList() {
 *   const projects = useProjects()
 *
 *   return (
 *     <ul>
 *       {projects.map((project) => (
 *         <li key={project.id}>{project.displayName}</li>
 *       ))}
 *     </ul>
 *   )
 * }
 *
 * // Usage with Suspense
 * function App() {
 *   return (
 *     <Suspense fallback={<div>Loading projects...</div>}>
 *       <ProjectList />
 *     </Suspense>
 *   )
 * }
 * ```
 *
 * @remarks
 * - Initial data fetching will trigger React Suspense
 * - Subsequent updates will happen in the background without triggering Suspense
 * - If an error occurs during background revalidation, it will be handled internally
 */
export function useProjects(): SanityProject[] {
  const instance = useSanityInstance()
  const {projects, subscribe} = getProjectState(instance)

  const getSnapshot = useCallback(() => {
    const currentState = getProjectState(instance)

    // If we don't have any projects and haven't started loading, throw promise for Suspense
    if (currentState.projects.length === 0 && !currentState.projectStatus['__all__']) {
      throw getProjects(instance)
    }

    return currentState.projects
  }, [instance])

  // Implement stale-while-revalidate behavior
  useEffect(() => {
    // Only trigger a refetch if we already have data
    if (projects.length > 0) {
      getProjects(instance, true).catch(() => {
        // Error handling is done in the store
      })
    }
  }, [instance, projects.length])

  return useSyncExternalStore(subscribe, getSnapshot)
}
