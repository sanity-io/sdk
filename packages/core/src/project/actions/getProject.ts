import {type SanityProject} from '@sanity/client'

import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {createAction} from '../../resources/createAction'
import {projectStore} from '../projectStore'

/** @public */
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
