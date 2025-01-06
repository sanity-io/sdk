import {defer, distinctUntilChanged, filter, map, Subscription} from 'rxjs'

import {createInternalAction} from '../resources/createAction'
import {AuthStateType} from './authStateType'
import type {AuthStoreState} from './authStore'
import {getStorageEvents, getTokenFromStorage} from './utils'

export const subscribeToStorageEventsAndSetToken = createInternalAction<
  AuthStoreState,
  [],
  Subscription
>(({state}) => {
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
