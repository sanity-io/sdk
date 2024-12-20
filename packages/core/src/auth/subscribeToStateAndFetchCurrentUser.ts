import type {CurrentUser} from '@sanity/types'
import {distinctUntilChanged, filter, map, switchMap} from 'rxjs'

import {createAction} from '../resources/createAction'
import {
  type AuthState,
  AuthStateType,
  DEFAULT_API_VERSION,
  getAuthStore,
  REQUEST_TAG_PREFIX,
} from './authStore'

export const subscribeToStateAndFetchCurrentUser = createAction(
  getAuthStore,
  ({state, instance}) => {
    const {projectId, dataset} = instance.identity
    const {clientFactory, apiHost, authScope} = state.get().options

    const currentUser$ = state.observable
      .pipe(
        map(({authState}) => authState),
        filter(
          (authState): authState is Extract<AuthState, {type: AuthStateType.LOGGED_IN}> =>
            authState.type === AuthStateType.LOGGED_IN && !authState.currentUser,
        ),
        map((authState) => authState.token),
        distinctUntilChanged(),
      )
      .pipe(
        map((token) =>
          clientFactory({
            projectId,
            dataset,
            apiVersion: DEFAULT_API_VERSION,
            requestTagPrefix: REQUEST_TAG_PREFIX,
            useProjectHostname: authScope === 'project',
            token,
            ignoreBrowserTokenWarning: true,
            ...(apiHost && {apiHost}),
          }),
        ),
        switchMap((client) =>
          client.observable.request<CurrentUser>({uri: '/users/me', method: 'GET'}),
        ),
      )

    return function () {
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
  },
)
