import {type SanityProject} from '@sanity/client'
import {getProjectsState, resolveProjects, type SanityInstance, type StateSource} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * @category Types
 * @interface
 */
export type ProjectWithoutMembers = Omit<SanityProject, 'members'>

type UseProjects = {
  /**
   *
   * Returns metadata for each project you have access to.
   *
   * @category Projects
   * @returns An array of metadata (minus the projects’ members) for each project
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
   */
  (options?: {organizationId?: string; includeMembers?: true}): SanityProject[]
  (options: {organizationId?: string; includeMembers?: false}): ProjectWithoutMembers[]
}

/**
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
