import {type SanityProject} from '@sanity/client'

import {createResource, type Resource} from '../resources/createResource'
import {monitorAuthState} from './actions/monitorAuthState'

/**
 * State tracked by the project store
 * @public
 */
export interface ProjectState {
  projects: SanityProject[]
  projectStatus: {
    [projectId: string]: {
      isPending: boolean
      error?: Error
      initialLoadComplete?: boolean
    }
  }
}

export const projectStore: Resource<ProjectState> = createResource({
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
