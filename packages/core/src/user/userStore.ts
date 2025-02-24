import {type SanityUser} from '@sanity/client'

import {createResource} from '../resources/createResource'
import {monitorAuthState} from './actions/monitorAuthState'

/**
 * State tracked by the user store
 * @public
 */
export interface UserState {
  /** Array of Sanity users */
  users: SanityUser[]
  /** Status information for each user, indexed by user ID */
  userStatus: {
    [userId: string]: {
      /** Indicates if the user is currently loading */
      isPending: boolean
      /** Error object if user loading or operations failed */
      error?: Error
      /** Indicates if the initial data load has completed */
      initialLoadComplete?: boolean
    }
  }
}

/**
 * Resource store managing user state and authentication monitoring
 * @internal
 */
export const userStore = createResource<UserState>({
  name: 'userStore',

  getInitialState: (): UserState => ({
    users: [],
    userStatus: {},
  }),

  initialize() {
    const authEventSubscription = monitorAuthState(this)
    return () => {
      authEventSubscription.unsubscribe()
    }
  },
})
