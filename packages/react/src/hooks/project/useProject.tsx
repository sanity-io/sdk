import {type SanityProject} from '@sanity/client'
import {getProject, getProjectState} from '@sanity/sdk'
import {useCallback, useEffect, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/** @beta */
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
