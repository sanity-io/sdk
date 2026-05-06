import {getProjectState, type Project, type ProjectOptions, resolveProject} from '@sanity/sdk'
import {identity} from 'rxjs'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * Returns metadata for a given project.
 *
 * @category Projects
 * @param options - Configuration options
 * @returns The metadata for the project. `members` is included only when
 *   `includeMembers: true`; `features` is included unless `includeFeatures: false`.
 * @example
 * ```tsx
 * function ProjectMetadata({projectId}: {projectId: string}) {
 *   const project = useProject({projectId})
 *
 *   return (
 *     <figure style={{backgroundColor: project.metadata.color || 'lavender'}}>
 *       <h1>{project.displayName}</h1>
 *     </figure>
 *   )
 * }
 * ```
 * @example
 * ```tsx
 * const projectWithMembersAndFeatures = useProject({projectId})
 * const projectWithMembers = useProject({projectId, includeMembers: true})
 * const projectWithoutMembers = useProject({projectId, includeMembers: false})
 * const projectWithoutFeatures = useProject({projectId, includeFeatures: false})
 * ```
 * @public
 * @function
 */
export const useProject = createStateSourceHook({
  getState: getProjectState,
  shouldSuspend: (instance, ...params) =>
    getProjectState(instance, ...params).getCurrent() === undefined,
  suspender: resolveProject,
  getConfig: identity,
}) as <IncludeMembers extends boolean = true, IncludeFeatures extends boolean = true>(
  options?: ProjectOptions<IncludeMembers, IncludeFeatures>,
) => Project<IncludeMembers, IncludeFeatures>
