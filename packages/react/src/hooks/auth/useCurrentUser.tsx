import {type CurrentUser, getCurrentUserState} from '@sanity/sdk'

import {useDashboardState} from '../dashboard/useDashboardState'

const currentUserFromState = (user: CurrentUser | null) => user

/** Returns the full current user profile, or `null` while signed out. @public */
export function useCurrentUser(): CurrentUser | null {
  return useDashboardState(
    'users.current',
    getCurrentUserState,
    currentUserFromState,
    currentUserFromState,
  )
}
