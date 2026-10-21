import {type CurrentUser} from '@sanity/types'
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  retry,
  type Subscription,
  switchMap,
  throwError,
  timer,
} from 'rxjs'

import {isTransientError} from '../client/retry'
import {
  OUT_OF_SYNC_RETRY_BASE_DELAY,
  OUT_OF_SYNC_RETRY_COUNT,
  OUT_OF_SYNC_RETRY_MAX_DELAY,
} from '../document/documentConstants'
import {type StoreContext} from '../store/defineStore'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {getAuthLogger} from './authLogger'
import {isStudioConfig} from './authMode'
import {AuthStateType} from './authStateType'
import {type AuthMethodOptions, type AuthState, type AuthStoreState} from './authStore'

/**
 * Subscribes to auth state changes and fetches the current user when
 * the state transitions to `LOGGED_IN` without a `currentUser`.
 *
 * Transient failures (see {@link isTransientError}) retry with a backoff before the
 * state becomes `ERROR`. Other failures set `ERROR` right away. A new token cancels a
 * pending retry, and a failure doesn't set `ERROR` once the user is no longer logged in.
 *
 * @param context - The store context for the auth store.
 * @param fetchOptions - Configuration options. When `useProjectHostname` is
 *   `true`, requests use the project-specific hostname (required for Studio
 *   cookie auth). Set to `true` for studio mode, `false` otherwise.
 *
 * @internal
 */
export const subscribeToStateAndFetchCurrentUser = (
  {state, instance}: StoreContext<AuthStoreState>,
  fetchOptions?: {useProjectHostname?: boolean},
): Subscription => {
  const logger = getAuthLogger(instance)

  const {clientFactory, apiHost} = state.get().options
  const useProjectHostname = fetchOptions?.useProjectHostname ?? isStudioConfig(instance.config)
  const projectId = instance.config.projectId

  const currentUser$ = state.observable
    .pipe(
      map(({authState, options: storeOptions}) => ({
        authState,
        authMethod: storeOptions.authMethod,
      })),
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
        client.observable
          .request<CurrentUser>({
            url: '/users/me',
            method: 'GET',
            tag: 'users.get-current',
          })
          .pipe(
            retry({
              count: OUT_OF_SYNC_RETRY_COUNT,
              delay: (error: unknown, retryCount) =>
                isTransientError(error)
                  ? timer(
                      Math.min(
                        OUT_OF_SYNC_RETRY_BASE_DELAY * 2 ** (retryCount - 1),
                        OUT_OF_SYNC_RETRY_MAX_DELAY,
                      ),
                    )
                  : throwError(() => error),
            }),
            /**
             * Catch inside switchMap so the outer subscription survives.
             * Without this, a 401 terminates the subscription permanently
             * and subsequent token refreshes via comlink never re-fetch /users/me.
             * @see SDK-1409
             */
            catchError((error) => {
              logger.error('Failed to fetch current user', {error})

              if (state.get().authState.type === AuthStateType.LOGGED_IN) {
                state.set('setError', {authState: {type: AuthStateType.ERROR, error}})
              }

              return EMPTY
            }),
          ),
      ),
    )

  return currentUser$.subscribe({
    next: (currentUser) => {
      logger.info('Current user fetched successfully', {
        hasEmail: !!currentUser.email,
      })
      // userId is PII, so only surface it at debug level
      logger.debug('Current user details', {userId: currentUser.id})
      state.set('setCurrentUser', (prev) => ({
        authState:
          prev.authState.type === AuthStateType.LOGGED_IN
            ? {...prev.authState, currentUser}
            : prev.authState,
      }))
    },
  })
}
