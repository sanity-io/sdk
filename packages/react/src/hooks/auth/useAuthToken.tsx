import {getTokenState} from '@sanity/sdk'

import {useDashboardState} from '../dashboard/useDashboardState'

const tokenFromState = (token: string | null) => token

/** Returns the current authentication token, or `null` while signed out. @public */
export function useAuthToken(): string | null {
  return useDashboardState('auth.token', getTokenState, tokenFromState, tokenFromState)
}
