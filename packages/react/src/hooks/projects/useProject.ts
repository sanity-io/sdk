import {
  getProjectState,
  resolveProject,
  type SanityInstance,
  type SanityProject,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

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
  (projectId: string): SanityProject
}

/**
 * @public
 * @function
 */
export const useProject: UseProject = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getProjectState as (
    instance: SanityInstance,
    projectId: string,
  ) => StateSource<SanityProject>,
  shouldSuspend: (instance, projectId) =>
    getProjectState(instance, projectId).getCurrent() === undefined,
  suspender: resolveProject,
})
