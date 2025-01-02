import {defer, distinctUntilChanged, filter, map} from 'rxjs'

import {createAction} from '../resources/createAction'
import {AuthStateType, getAuthStore} from './authStore'
import {getStorageEvents, getTokenFromStorage} from './utils'

export const subscribeToStorageEventsAndSetToken = createAction(getAuthStore, ({state}) => {
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
      state.set('updateTokenFromStorageEvent', {
        authState: token
          ? {type: AuthStateType.LOGGED_IN, token, currentUser: null}
          : {type: AuthStateType.LOGGED_OUT, isDestroyingSession: false},
      })
    })
  }
})
