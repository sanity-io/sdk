import {distinctUntilChanged} from 'rxjs'

import {AuthStateType} from '../../auth/authStateType'
import {type AuthState, getAuthState} from '../../auth/authStore'
import {type ActionContext, createInternalAction} from '../../resources/createAction'
import {type UserState} from '../userStore'

/**
 * Updates the user state when authentication state changes
 * @param prev - The current user state
 * @param authState - The new authentication state
 * @returns A Promise resolving to the updated user state
 */
async function authStateChanged(prev: UserState, authState: AuthState): Promise<UserState> {
  if (authState.type === AuthStateType.LOGGED_OUT || authState.type === AuthStateType.ERROR) {
    return {
      ...prev,
      users: [],
      userStatus: {},
    }
  }
  return prev
}

/**
 * Creates an action that monitors authentication state changes and updates the user state accordingly.
 * When a user logs out or encounters an auth error, it clears the users array and user status.
 *
 * @internal
 * @param context - The sanity context containing instance and state
 * @returns A function that sets up the auth state subscription
 */
export const monitorAuthState = createInternalAction(
  ({instance, state}: ActionContext<UserState>) => {
    return () => {
      return getAuthState(instance)
        .observable.pipe(distinctUntilChanged((prev, curr) => prev?.type === curr?.type))
        .subscribe((authState) => {
          authStateChanged(state.get(), authState ?? undefined).then((newState) => {
            state.set('authStateChanged', newState)
          })
        })
    }
  },
)
