import {type SanityProject} from '@sanity/client'
import {
  type DatasetResource,
  getProjectState,
  isDatasetResource,
  type ProjectHandle,
  resolveProject,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useNormalizedResourceOptions} from '../helpers/useNormalizedResourceOptions'

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

const useProjectValue: UseProject = createStateSourceHook({
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

/**
 * @public
 * @function
 */
export const useProject: UseProject = (projectHandle?: ProjectHandle) => {
  // it seems silly that someone might pass {resource: ...} to this hook
  // but normalizing could be useful if they pass no options, or a resource name
  const normalizedOptions = useNormalizedResourceOptions(projectHandle ?? {})
  if (
    !projectHandle?.projectId &&
    (!isDatasetResource(normalizedOptions.resource) ||
      normalizedOptions.resource.projectId === undefined)
  ) {
    throw new Error(
      'Pass a resource that is a dataset resource, or a project handle with a projectId',
    )
  }
  const projectId =
    projectHandle?.projectId ?? (normalizedOptions.resource as DatasetResource).projectId
  return useProjectValue({projectId})
}
