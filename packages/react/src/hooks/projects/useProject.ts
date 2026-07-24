import {type Project, project, type ProjectOptions} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'
import {useResolvedProjectId} from '../helpers/useResolvedProjectId'

const useProjectBase = createFetcherHook(project)

/**
 * Returns metadata for a given project.
 *
 * @category Projects
 * @param options - Configuration options
 * @returns A {@link FetcherHookResult} whose `data` is the metadata for the
 *   project. `members` is included only when `includeMembers: true`; `features`
 *   is included unless `includeFeatures: false`.
 * @example
 * ```tsx
 * function ProjectMetadata({projectId}: {projectId: string}) {
 *   const {data: project} = useProject({projectId})
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
 * const {data: projectWithMembersAndFeatures} = useProject({projectId})
 * const {data: projectWithMembers} = useProject({projectId, includeMembers: true})
 * const {data: projectWithoutMembers} = useProject({projectId, includeMembers: false})
 * const {data: projectWithoutFeatures} = useProject({projectId, includeFeatures: false})
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
) => FetcherHookResult<Project<IncludeMembers, IncludeFeatures>>
