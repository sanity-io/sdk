import {type SanityProject} from '@sanity/client'
import {getProjects, getProjectState} from '@sanity/sdk'
import {useCallback, useEffect, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/** @beta */
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
