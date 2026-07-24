import {type Project, projects, type ProjectsOptions} from '@sanity/sdk'

import {createFetcherHook, type FetcherHookResult} from '../helpers/createFetcherHook'

/**
 * @public
 * @category Types
 * @interface
 * @deprecated use the Project type directly.
 */
export type ProjectWithoutMembers = Project

/**
 * Returns metadata for each project you have access to.
 *
 * @category Projects
 * @param options - Configuration options
 * @returns A {@link FetcherHookResult} whose `data` is an array of project
 *   metadata. `members` is included only when `includeMembers: true`; `features`
 *   is included unless `includeFeatures: false`.
 * @example
 * ```tsx
 * const {data: projects} = useProjects()
 *
 * return (
 *   <select>
 *     {projects.map((project) => (
 *       <option key={project.id}>{project.displayName}</option>
 *     ))}
 *   </select>
 * )
 * ```
 * @example
 * ```tsx
 * const {data: projects} = useProjects()
 * const {data: projectsWithFeatures} = useProjects()
 * const {data: projectsWithMembers} = useProjects({includeMembers: true})
 * const {data: projectsWithoutMembers} = useProjects({includeMembers: false})
 * const {data: projectsWithoutFeatures} = useProjects({includeFeatures: false})
 * ```
 * @public
 * @function
 */
export const useProjects = createFetcherHook(projects) as <
  IncludeMembers extends boolean = false,
  IncludeFeatures extends boolean = true,
>(
  options?: ProjectsOptions<IncludeMembers, IncludeFeatures>,
) => FetcherHookResult<Project<IncludeMembers, IncludeFeatures>[]>
