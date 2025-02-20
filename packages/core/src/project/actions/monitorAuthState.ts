import {distinctUntilChanged} from 'rxjs'

import {AuthStateType} from '../../auth/authStateType'
import {type AuthState, getAuthState} from '../../auth/authStore'
import {type ActionContext, createInternalAction} from '../../resources/createAction'
import {type ProjectState} from '../projectStore'

/**
 * Updates the project state when authentication state changes
 * @param prev - The current project state
 * @param authState - The new authentication state
 * @returns A Promise resolving to the updated project state
 */
async function authStateChanged(prev: ProjectState, authState: AuthState): Promise<ProjectState> {
  if (authState.type === AuthStateType.LOGGED_OUT || authState.type === AuthStateType.ERROR) {
    return {
      ...prev,
      projects: [],
      projectStatus: {},
    }
  }
  return prev
}

/**
 * Creates an action that monitors authentication state changes and updates the project state accordingly.
 * When a user logs out or encounters an auth error, it clears the projects array and project status.
 *
 * @internal
 * @param context - The sanity context containing instance and state
 * @returns A function that sets up the auth state subscription
 */
export const monitorAuthState = createInternalAction(
  ({instance, state}: ActionContext<ProjectState>) => {
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
