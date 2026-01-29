import {defer, distinctUntilChanged, filter, map, type Subscription} from 'rxjs'

import {type StoreContext} from '../store/defineStore'
import {AuthStateType} from './authStateType'
import {type AuthStoreState} from './authStore'
import {createLoggedInAuthState, getStorageEvents, getTokenFromStorage} from './utils'

export const subscribeToStorageEventsAndSetToken = ({
  state,
}: StoreContext<AuthStoreState>): Subscription => {
  const {storageArea, storageKey} = state.get().options

  const tokenFromStorage$ = defer(getStorageEvents).pipe(
    filter(
      (e): e is StorageEvent & {newValue: string} =>
        e.storageArea === storageArea && e.key === storageKey,
    ),
    map(() => getTokenFromStorage(storageArea, storageKey)),
    distinctUntilChanged(),
  )

  return tokenFromStorage$.subscribe((token) => {
    state.set('updateTokenFromStorageEvent', {
      authState: token
        ? createLoggedInAuthState(token, null)
        : {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
    })
  })
}
