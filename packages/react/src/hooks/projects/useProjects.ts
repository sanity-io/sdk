import {type SanityProject} from '@sanity/client'
import {getProjectsState, resolveProjects, type SanityInstance, type StateSource} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * @category Types
 * @interface
 */
export type ProjectWithoutMembers = Omit<SanityProject, 'members'>

/**
 * @public
 * @category Types
 */
type UseProjects = <TIncludeMembers extends boolean = false>(options?: {
  organizationId?: string
  includeMembers?: TIncludeMembers
}) => TIncludeMembers extends true ? SanityProject[] : ProjectWithoutMembers[]

/**
 * Returns metadata for each project you have access to.
 *
 * @category Projects
 * @param options - Configuration options
 * @returns An array of project metadata. If includeMembers is true, returns full SanityProject objects. Otherwise, returns ProjectWithoutMembers objects.
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
 * const projectsWithMembers = useProjects({ includeMembers: true })
 * const projectsWithoutMembers = useProjects({ includeMembers: false })
 * ```
 * @public
 * @function
 */
export const useProjects: UseProjects = createStateSourceHook({
  getState: getProjectsState as (
    instance: SanityInstance,
    options?: {organizationId?: string; includeMembers?: boolean},
  ) => StateSource<SanityProject[] | ProjectWithoutMembers[]>,
  shouldSuspend: (instance, options) =>
    getProjectsState(instance, options).getCurrent() === undefined,
  suspender: resolveProjects,
}) as UseProjects
