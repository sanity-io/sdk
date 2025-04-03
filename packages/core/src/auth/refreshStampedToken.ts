import {
  distinctUntilChanged,
  filter,
  interval,
  map,
  type Subscription,
  switchMap,
  takeWhile,
} from 'rxjs'

import {type StoreContext} from '../store/defineStore'
import {DEFAULT_API_VERSION} from './authConstants'
import {AuthStateType} from './authStateType'
import {type AuthState, type AuthStoreState} from './authStore'

/**
 * @internal
 */
export const refreshStampedToken = ({state}: StoreContext<AuthStoreState>): Subscription => {
  const {clientFactory, apiHost, storageArea, storageKey} = state.get().options

  const refreshInterval = 12 * 60 * 60 * 1000 // refresh the token every 12 hours

  const refreshToken$ = state.observable.pipe(
    map(({authState}) => authState),
    filter(
      (authState): authState is Extract<AuthState, {type: AuthStateType.LOGGED_IN}> =>
        authState.type === AuthStateType.LOGGED_IN,
    ),
    distinctUntilChanged(),
    filter((authState) => authState.token.includes('-st')), // Ensure we only try to refresh stamped tokens
    switchMap((authState) =>
      interval(refreshInterval).pipe(
        takeWhile(() => state.get().authState.type === AuthStateType.LOGGED_IN),
        map(() => authState.token),
        distinctUntilChanged(),
        map((token) =>
          clientFactory({
            apiVersion: DEFAULT_API_VERSION,
            requestTagPrefix: 'sdk.token-refresh',
            useProjectHostname: false,
            token,
            ignoreBrowserTokenWarning: true,
            ...(apiHost && {apiHost}),
          }),
        ),
        switchMap((client) =>
          client.observable.request<{token: string}>({
            uri: 'auth/refresh-token',
            method: 'POST',
            body: {
              token: authState.token,
            },
          }),
        ),
      ),
    ),
  )

  return refreshToken$.subscribe({
    next: (response) => {
      state.set('setRefreshStampedToken', (prev) => ({
        authState:
          prev.authState.type === AuthStateType.LOGGED_IN
            ? {...prev.authState, token: response.token}
            : prev.authState,
      }))
      storageArea?.setItem(storageKey, JSON.stringify({token: response.token}))
    },
    error: (error) => {
      state.set('setRefreshStampedTokenError', {authState: {type: AuthStateType.ERROR, error}})
    },
  })
}
