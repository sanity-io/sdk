import {type SanityProject} from '@sanity/client'
import {
  getProjectState,
  type ProjectHandle,
  resolveProject,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

type UseProject = {
  /**
   *
   * Returns metadata for a given project
   *
   * @category Projects
   * @param projectHandle - An optional project handle identifying which project to retrieve metadata for
   * @returns The metadata for the project
   * @example
   * ```tsx
   *  function ProjectMetadata({ projectId }: { projectId: string }) {
   *    const project = useProject({ projectId })
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
export const useProject: UseProject = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getProjectState as (
    instance: SanityInstance,
    projectHandle?: ProjectHandle,
  ) => StateSource<SanityProject>,
  shouldSuspend: (instance: SanityInstance, projectHandle?: ProjectHandle) =>
    getProjectState(instance, projectHandle as ProjectHandle).getCurrent() === undefined,
  suspender: (instance: SanityInstance, projectHandle?: ProjectHandle) =>
    resolveProject(instance, projectHandle as ProjectHandle),
}) as UseProject
