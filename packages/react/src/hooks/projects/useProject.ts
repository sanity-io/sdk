import {
  getProjectState,
  type ProjectHandle,
  resolveProject,
  type SanityInstance,
  type SanityProject,
  type StateSource,
} from '@sanity/sdk'
import {identity} from 'rxjs'

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
  (projectHandle?: ProjectHandle): SanityProject
}

/** @public */
export const useProject: UseProject = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getProjectState as (
    instance: SanityInstance,
    projectHandle?: ProjectHandle,
  ) => StateSource<SanityProject>,
  shouldSuspend: (instance, projectHandle) =>
    getProjectState(instance, projectHandle).getCurrent() === undefined,
  suspender: resolveProject,
  getConfig: identity,
})
