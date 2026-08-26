import {getProjectState, type Project, type ProjectOptions, resolveProject} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'

const useProjectBase = createStateSourceHook({
  getState: getProjectState,
  shouldSuspend: (instance, ...params) =>
    getProjectState(instance, ...params).getCurrent() === undefined,
  suspender: resolveProject,
})

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
 * @remarks
 * The `projectId` is resolved in order from:
 * 1. an explicit `projectId` option
 * 2. A legacy ProjectContext (e.g. a `<ResourceProvider projectId="…">` with no dataset), then
 * 3. The active resource (`ResourceProvider`/`SDKProvider`)
 * 4. `instance.config`.
 * @public
 * @function
 */
export const useProject = ((options?: ProjectOptions<boolean, boolean>) => {
  const projectId = useResolvedProjectId(options)
  return useProjectBase(projectId ? {...options, projectId} : options)
}) as <IncludeMembers extends boolean = true, IncludeFeatures extends boolean = true>(
  options?: ProjectOptions<IncludeMembers, IncludeFeatures>,
) => Project<IncludeMembers, IncludeFeatures>
