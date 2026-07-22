import {
  type Project,
  projects,
  type ProjectsOptions,
  type SanityInstance,
  type StateSource,
} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'
import {mapStateSource} from '../helpers/mapStateSource'

/**
 * @public
 * @category Types
 * @interface
 * @deprecated use the Project type directly.
 */
export type ProjectWithoutMembers = Project

const getProjectsData = (
  instance: SanityInstance,
  options?: ProjectsOptions<boolean, boolean>,
): StateSource<Project<boolean, boolean>[] | undefined> =>
  mapStateSource(projects.getState(instance, options), (snapshot) => snapshot.data)

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
 * const projects = useProjects()
 * const projectsWithFeatures = useProjects()
 * const projectsWithMembers = useProjects({includeMembers: true})
 * const projectsWithoutMembers = useProjects({includeMembers: false})
 * const projectsWithoutFeatures = useProjects({includeFeatures: false})
 * ```
 * @public
 * @function
 */
export const useProjects = createStateSourceHook({
  getState: getProjectsData,
  shouldSuspend: (instance, ...params) =>
    getProjectsData(instance, ...params).getCurrent() === undefined,
  suspender: projects.resolveState,
}) as <IncludeMembers extends boolean = false, IncludeFeatures extends boolean = true>(
  options?: ProjectsOptions<IncludeMembers, IncludeFeatures>,
) => Project<IncludeMembers, IncludeFeatures>[]
