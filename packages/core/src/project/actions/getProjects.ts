import {type SanityProject} from '@sanity/client'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {createAction} from '../../resources/createAction'
import {projectStore} from '../projectStore'

/**
 * Fetches a list of Sanity projects associated with the current credentials.
 *
 * This action manages the loading state and caching of projects in the project store.
 * It will return cached projects unless a force refresh is requested or no projects
 * are currently loaded.
 *
 * @public
 *
 * @param forceRefetch - When true, bypasses the cache and fetches fresh data from the API
 * @returns Promise that resolves to an array of Sanity projects
 *
 * @throws Error When the API request fails
 *
 * @example
 * ```typescript
 * // Get projects from cache (if available)
 * const projects = await getProjects()
 *
 * // Force a fresh fetch from the API
 * const freshProjects = await getProjects(true)
 *
 * // Example project response
 * const project = {
 *   id: 'project-id',
 *   name: 'My Project',
 *   organizationId: 'org-id',
 *   // ... other project properties
 * }
 * ```
 *
 * @remarks
 * The action maintains loading and error states in the project store under `projectStatus`.
 * Each project gets its own status entry, and there's a special `__all__` status that
 * tracks the overall loading state.
 *
 * The store state includes:
 * - `projects`: Array of {@link SanityProject} objects
 * - `projectStatus`: Record of loading states for each project
 *   - `isPending`: Whether the project is currently loading
 *   - `error`: Error object if the fetch failed
 *   - `initialLoadComplete`: Whether the first load has completed
 */
export const getProjects = createAction(
  projectStore,
  ({state, instance}) =>
    async (forceRefetch = false): Promise<SanityProject[]> => {
      const {projects, projectStatus} = state.get()
      const allProjectsStatus = projectStatus['__all__']

      // Return existing projects if we have them, they're not loading, and we're not forcing a refetch
      if (
        projects.length > 0 &&
        allProjectsStatus &&
        !allProjectsStatus.isPending &&
        !forceRefetch
      ) {
        return projects
      }

      // If we're already loading projects, return the current list
      if (allProjectsStatus?.isPending) {
        return projects
      }

      // Set loading state
      state.set('projectsRequested', {
        projectStatus: {
          ...state.get().projectStatus,
          __all__: {
            isPending: true,
            initialLoadComplete: allProjectsStatus?.initialLoadComplete || false,
          },
        },
      })

      try {
        const client = getGlobalClient(instance)
        const projectsResponse = await client.projects.list()

        // Create status entries for each project
        const newProjectStatus = projectsResponse.reduce(
          (acc, project) => {
            acc[project.id] = {
              isPending: false,
              initialLoadComplete: true,
            }
            return acc
          },
          {
            __all__: {
              isPending: false,
              initialLoadComplete: true,
            },
          } as Record<
            string,
            {
              isPending: boolean
              error?: Error
              initialLoadComplete: boolean
            }
          >,
        )

        // Add individual project statuses
        projectsResponse.forEach((project) => {
          newProjectStatus[project.id] = {
            isPending: false,
            initialLoadComplete: true,
          }
        })

        state.set('projectsLoaded', {
          projects: projectsResponse,
          projectStatus: newProjectStatus,
        })

        return projectsResponse
      } catch (err) {
        // Update error state
        state.set('projectsRequested', {
          projectStatus: {
            ...state.get().projectStatus,
            __all__: {
              isPending: false,
              error: err as Error,
              initialLoadComplete: allProjectsStatus?.initialLoadComplete || false,
            },
          },
        })
        throw err
      }
    },
)
