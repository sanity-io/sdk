import {getProjectState, type ProjectHandle, type SanityProject} from '@sanity/sdk'
import {useMemo} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useStoreState} from '../helpers/useStoreState'

type UseProject = {
  /**
   *
   * Returns metadata for a given project
   *
   * @category Projects
   * @param projectId - The ID of the project to retrieve metadata for
   * @returns The metadata for the project
   * @example
   * ```tsx
   *  function ProjectMetadata({ projectId }: { projectId: string }) {
   *    const project = useProject(projectId)
   *
   *    return (
   *      <figure style={{ backgroundColor: project.metadata.color || 'lavender'}}>
   *        <h1>{project.displayName}</h1>
   *      </figure>
   *    )
   *  }
   * ```
   */
  (projectHandle?: ProjectHandle): SanityProject
}

/**
 * @public
 * @function
 */
export const useProject: UseProject = (options) => {
  const instance = useSanityInstance()
  const projectId = options?.projectId ?? instance.config.projectId
  if (!projectId) throw new Error('useProject must be configured with projectId')
  const state = useMemo(() => getProjectState(instance, {projectId}), [instance, projectId])
  return useStoreState(state)
}
