import {type CurrentUser} from '@sanity/types'
import {distinctUntilChanged, filter, map, switchMap} from 'rxjs'

import {type ActionContext, createInternalAction} from '../resources/createAction'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {AuthStateType} from './authStateType'
import {type AuthState, type AuthStoreState} from './authStore'
import {setAuthError} from './utils'

export const subscribeToStateAndFetchCurrentUser = createInternalAction(
  ({state}: ActionContext<AuthStoreState>) => {
    const {clientFactory, apiHost} = state.get().options

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
            apiVersion: DEFAULT_API_VERSION,
            requestTagPrefix: REQUEST_TAG_PREFIX,
            token,
            ignoreBrowserTokenWarning: true,
            useProjectHostname: false,
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
          state.set('setError', setAuthError(error))
        },
      })
    }
  },
)
