import {type SanityProject} from '@sanity/client'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {createAction} from '../../resources/createAction'
import {projectStore} from '../projectStore'

/**
 * Fetches a Sanity project by its ID, with caching and loading state management.
 *
 * This action will:
 * 1. Return cached project data if available and not forcing a refetch
 * 2. Return a loading placeholder if the project is currently being fetched
 * 3. Fetch the project from Sanity if needed
 *
 * @public
 *
 * @param projectId - The ID of the Sanity project to fetch
 * @param forceRefetch - Optional boolean to force a new fetch, ignoring cache. Defaults to false
 * @returns Promise resolving to the Sanity project data
 *
 * @throws Will throw an error if the project fetch fails
 *
 * @example
 * ```typescript
 * // Fetch a project using cached data if available
 * const project = await getProject('your-project-id')
 * console.log(project.id, project.displayName)
 *
 * // Force a fresh fetch from Sanity
 * const freshProject = await getProject('your-project-id', true)
 *
 * // Handle potential errors
 * try {
 *   const project = await getProject('invalid-id')
 * } catch (err) {
 *   console.error('Failed to fetch project:', err)
 * }
 * ```
 *
 * The action manages several states in the project store:
 * - `projectRequested`: Initial loading state
 * - `projectLoaded`: Successful fetch state
 * - `projectRequestedError`: Error state
 *
 * Each project's status includes:
 * - `isPending`: Whether the project is currently being fetched
 * - `initialLoadComplete`: Whether the project has been successfully loaded at least once
 * - `error`: Any error that occurred during fetching
 */
export const getProject = createAction(
  projectStore,
  ({state, instance}) =>
    async (projectId: string, forceRefetch = false): Promise<SanityProject> => {
      const {projects, projectStatus} = state.get()

      const existing = projects.find((p) => p.id === projectId)
      const status = projectStatus[projectId]

      // Return existing project if we have it, it's not loading, and we're not forcing a refetch
      if (existing && status && !status.isPending && !forceRefetch) {
        return existing
      }

      // If we're already loading this project, return the loading placeholder
      if (status?.isPending) {
        return existing || ({id: projectId} as unknown as SanityProject)
      }

      // If we don't have a loading state yet, add one
      if (!existing) {
        state.set('projectRequested', {
          projects: [...projects, {id: projectId} as unknown as SanityProject],
          projectStatus: {
            ...state.get().projectStatus,
            [projectId]: {
              isPending: true,
              initialLoadComplete: status?.initialLoadComplete || false,
            },
          },
        })
      }

      try {
        const client = getGlobalClient(instance)
        const project = await client.projects.getById(projectId)

        // Update the project in the store
        state.set('projectLoaded', {
          projects: existing
            ? projects.map((p) => (p.id === projectId ? project : p))
            : [...projects, project],
          projectStatus: {
            ...state.get().projectStatus,
            [projectId]: {
              isPending: false,
              initialLoadComplete: true,
            },
          },
        })

        return project
      } catch (err) {
        // Update error state
        state.set('projectRequestedError', {
          projectStatus: {
            ...state.get().projectStatus,
            [projectId]: {
              isPending: false,
              error: err as Error,
              initialLoadComplete: status?.initialLoadComplete || false,
            },
          },
        })
        throw err
      }
    },
)
