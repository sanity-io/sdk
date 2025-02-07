import {distinctUntilChanged} from 'rxjs'

import {AuthStateType} from '../../auth/authStateType'
import {type AuthState, getAuthState} from '../../auth/authStore'
import {getGlobalClient} from '../../client/actions/getGlobalClient'
import {type SanityInstance} from '../../instance/types'
import {type ActionContext, createInternalAction} from '../../resources/createAction'
import {type Permission, type PermissionsState} from '../permissionsStore'

async function authStateChanged(
  prev: PermissionsState,
  authState: AuthState,
  instance: SanityInstance,
): Promise<PermissionsState> {
  if (authState.type === AuthStateType.LOGGED_IN) {
    const client = getGlobalClient(instance)
    const permissionsResponse = await client.request<Permission[]>({
      uri: 'access/permissions/me',
      method: 'GET',
    })

    return {
      permissions: permissionsResponse,
    }
  }
  if (authState.type === AuthStateType.LOGGED_OUT || authState.type === AuthStateType.ERROR) {
    return {
      ...prev,
      permissions: [],
    }
  }
  return prev
}

/**
 * Updates the permissions store state when the auth state changes.
 * @internal
 */
export const subscribeToAuthEvents = createInternalAction(
  ({instance, state}: ActionContext<PermissionsState>) => {
    return () => {
      return getAuthState(instance)
        .observable.pipe(distinctUntilChanged((prev, curr) => prev?.type === curr?.type))
        .subscribe((authState) => {
          authStateChanged(state.get(), authState ?? undefined, instance).then((newState) => {
            state.set('authStateChanged', newState)
          })
        })
    }
  },
)
