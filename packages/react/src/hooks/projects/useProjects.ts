import {getProjectsState, type Project, type ProjectsOptions, resolveProjects} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

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
 * @returns An array of project metadata. `members` is included only when
 *   `includeMembers: true`; `features` is included unless `includeFeatures: false`.
 * @example
 * ```tsx
 * const projects = useProjects()
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
 * const projectsWithMembers = useProjects({includeMembers: true})
 * const projectsWithoutMembers = useProjects({includeMembers: false})
 * const projectsWithoutFeatures = useProjects({includeFeatures: false})
 * ```
 * @public
 * @function
 */
export const useProjects = createStateSourceHook({
  getState: getProjectsState,
  shouldSuspend: (instance, ...params) =>
    getProjectsState(instance, ...params).getCurrent() === undefined,
  suspender: resolveProjects,
}) as <IncludeMembers extends boolean = false, IncludeFeatures extends boolean = true>(
  options?: ProjectsOptions<IncludeMembers, IncludeFeatures>,
) => Project<IncludeMembers, IncludeFeatures>[]
