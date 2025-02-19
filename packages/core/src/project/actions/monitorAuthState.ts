import {distinctUntilChanged} from 'rxjs'

import {AuthStateType} from '../../auth/authStateType'
import {type AuthState, getAuthState} from '../../auth/authStore'
import {type ActionContext, createInternalAction} from '../../resources/createAction'
import {type ProjectState} from '../projectStore'

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
 * Updates the permissions store state when the auth state changes.
 * @internal
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
