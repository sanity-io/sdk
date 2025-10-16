import {type CurrentUser} from '@sanity/types'
import {distinctUntilChanged, filter, map, type Subscription, switchMap} from 'rxjs'

import {type StoreContext} from '../store/defineStore'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {AuthStateType} from './authStateType'
import {type AuthMethodOptions, type AuthState, type AuthStoreState} from './authStore'

export const subscribeToStateAndFetchCurrentUser = ({
  state,
  instance,
}: StoreContext<AuthStoreState>): Subscription => {
  const {clientFactory, apiHost} = state.get().options
  const useProjectHostname = !!instance.config.studioMode?.enabled
  const projectId = instance.config.projectId

  const currentUser$ = state.observable
    .pipe(
      map(({authState, options}) => ({authState, authMethod: options.authMethod})),
      filter(
        (
          value,
        ): value is {
          authState: Extract<AuthState, {type: AuthStateType.LOGGED_IN}>
          authMethod: AuthMethodOptions
        } => value.authState.type === AuthStateType.LOGGED_IN && !value.authState.currentUser,
      ),
      map((value) => ({token: value.authState.token, authMethod: value.authMethod})),
      distinctUntilChanged(
        (prev, curr) => prev.token === curr.token && prev.authMethod === curr.authMethod,
      ),
    )
    .pipe(
      map(({token, authMethod}) =>
        clientFactory({
          apiVersion: DEFAULT_API_VERSION,
          requestTagPrefix: REQUEST_TAG_PREFIX,
          token: authMethod === 'cookie' ? undefined : token,
          ignoreBrowserTokenWarning: true,
          useProjectHostname,
          useCdn: false,
          ...(authMethod === 'cookie' ? {withCredentials: true} : {}),
          ...(useProjectHostname && projectId ? {projectId} : {}),
          ...(apiHost && {apiHost}),
        }),
      ),
      switchMap((client) =>
        client.observable.request<CurrentUser>({uri: '/users/me', method: 'GET'}),
      ),
    )

  return currentUser$.subscribe({
    next: (currentUser) => {
      state.set('setCurrentUser', (prev) => ({
        authState:
          prev.authState.type === AuthStateType.LOGGED_IN
            ? {...prev.authState, currentUser}
            : prev.authState,
      }))
    },
    error: (error) => {
      state.set('setError', {authState: {type: AuthStateType.ERROR, error}})
    },
  })
}
