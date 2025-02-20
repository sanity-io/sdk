/**
 * Manages the state and lifecycle of Sanity projects within the application
 */

import {type SanityProject} from '@sanity/client'

import {createResource} from '../resources/createResource'
import {monitorAuthState} from './actions/monitorAuthState'

/**
 * State tracked by the project store
 * @public
 */
export interface ProjectState {
  /** Array of Sanity projects associated with the current user */
  projects: SanityProject[]
  /** Status information for each project, indexed by project ID */
  projectStatus: {
    [projectId: string]: {
      /** Indicates if the project is currently loading */
      isPending: boolean
      /** Error object if project loading or operations failed */
      error?: Error
      /** Indicates if the initial data load has completed */
      initialLoadComplete?: boolean
    }
  }
}

/**
 * Resource store managing project state and authentication monitoring
 * @internal
 */
export const projectStore = createResource<ProjectState>({
  name: 'projectStore',

  getInitialState: (): ProjectState => ({
    projects: [],
    projectStatus: {},
  }),

  initialize() {
    const authEventSubscription = monitorAuthState(this)
    return () => {
      authEventSubscription.unsubscribe()
    }
  },
})
