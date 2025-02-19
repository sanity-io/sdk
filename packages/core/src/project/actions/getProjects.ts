import {type SanityProject} from '@sanity/client'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {createAction} from '../../resources/createAction'
import {projectStore} from '../projectStore'

/** @public */
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
