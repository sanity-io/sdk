import {type SanityProject} from '@sanity/client'
import {getProjectsState, resolveProjects, type SanityInstance, type StateSource} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @public
 * @category Types
 */
export type ProjectWithoutMembers = Omit<SanityProject, 'members'>

/**
 * @public
 */
export interface UseProjects {
  /**
   *
   * Returns metadata for each project in your organization.
   *
   * @category Projects
   * @returns An array of metadata (minus the projects’ members) for each project in your organization
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
  (): ProjectWithoutMembers[]
}

/** @public */
export const useProjects: UseProjects = createStateSourceHook({
  // remove `undefined` since we're suspending when that is the case
  getState: getProjectsState as (instance: SanityInstance) => StateSource<ProjectWithoutMembers[]>,
  shouldSuspend: (instance) => getProjectsState(instance).getCurrent() === undefined,
  suspender: resolveProjects,
})
