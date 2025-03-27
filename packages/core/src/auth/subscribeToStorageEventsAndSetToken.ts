import {defer, distinctUntilChanged, filter, map} from 'rxjs'

import {type ActionContext, createInternalAction} from '../resources/createAction'
import {AuthStateType} from './authStateType'
import {type AuthStoreState} from './authStore'
import {getStorageEvents, getTokenFromStorage} from './utils'

const getBaseToken = (token: string) => {
  const parts = token.split('-st')
  return parts[0]
}

const shouldPreserveUser = (oldToken: string | undefined, newToken: string) => {
  // If new token has stamp, always preserve user
  if (newToken.includes('-st')) return true

  // If old token exists and base tokens match, don't preserve user
  if (oldToken && getBaseToken(oldToken) === getBaseToken(newToken)) return false

  // Otherwise preserve user (different base token)
  return true
}

export const subscribeToStorageEventsAndSetToken = createInternalAction(
  ({state}: ActionContext<AuthStoreState>) => {
    const {storageArea, storageKey} = state.get().options

    const tokenFromStorage$ = defer(getStorageEvents).pipe(
      filter(
        (e): e is StorageEvent & {newValue: string} =>
          e.storageArea === storageArea && e.key === storageKey,
      ),
      map(() => getTokenFromStorage(storageArea, storageKey)),
      distinctUntilChanged(),
    )

    return function () {
      return tokenFromStorage$.subscribe((token) => {
        state.set('updateTokenFromStorageEvent', (prev) => ({
          authState: token
            ? {
                type: AuthStateType.LOGGED_IN,
                token,
                currentUser:
                  prev.authState.type === AuthStateType.LOGGED_IN &&
                  shouldPreserveUser(prev.authState.token, token)
                    ? prev.authState.currentUser
                    : null,
              }
            : {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
        }))
      })
    }
  },
)
