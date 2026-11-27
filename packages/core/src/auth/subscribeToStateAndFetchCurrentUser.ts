import {ClientError} from '@sanity/client'
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
import {buildQuery} from '../utils/buildQuery'
import {resolveRequestTagPrefix} from '../utils/requestTagPrefix'
import {CURRENT_USER_API_VERSION} from './authConstants'
import {getAuthLogger} from './authLogger'
import {isStudioConfig} from './authMode'
import {AuthStateType} from './authStateType'
import {type AuthStoreState} from './authStore'

/**
 * Subscribes to auth state changes and fetches the current user whenever
 * the `LOGGED_IN` token changes.
 *
 * Transient failures (see {@link isTransientError}) retry with a backoff before the
 * state becomes `ERROR`. Other failures set `ERROR` right away. A new token cancels a
 * pending retry, and a failure doesn't set `ERROR` once the user is no longer logged in.
 * While a user is cached, only a 401 sets `ERROR`, so a failed fetch after a token
 * refresh keeps the session.
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
  const includeUserAttributes = instance.config.auth?.includeUserAttributes ?? false

  const currentUser$ = state.observable
    .pipe(
      filter(
        ({authState}) =>
          authState.type === AuthStateType.LOGGED_OUT || authState.type === AuthStateType.LOGGED_IN,
      ),
      map(({authState, options: storeOptions}) =>
        authState.type === AuthStateType.LOGGED_IN
          ? {token: authState.token, authMethod: storeOptions.authMethod}
          : null,
      ),
      distinctUntilChanged(
        (prev, curr) => prev?.token === curr?.token && prev?.authMethod === curr?.authMethod,
      ),
    )
    .pipe(
      map((key) => {
        if (!key) return null

        const {token, authMethod} = key

        const client = clientFactory({
          apiVersion: CURRENT_USER_API_VERSION,
          requestTagPrefix: resolveRequestTagPrefix(instance.config.requestTagPrefix, 'auth'),
          token: authMethod === 'cookie' ? undefined : token,
          ignoreBrowserTokenWarning: true,
          useProjectHostname,
          useCdn: false,
          ...(authMethod === 'cookie' ? {withCredentials: true} : {}),
          ...(useProjectHostname && projectId ? {projectId} : {}),
          ...(apiHost && {apiHost}),
        })
        return {client, token}
      }),
      switchMap((target) => {
        if (!target) return EMPTY
        const {client, token} = target

        return client.observable
          .request<CurrentUser>({
            url: '/users/me',
            method: 'GET',
            tag: 'users.get-current',
            ...(includeUserAttributes && {
              query: buildQuery({
                includeUserAttributes: true,
                // Ignored on the project API, which reads the organization from the project
                organizationId:
                  state.get().dashboardContext?.orgId ?? instance.config.organizationId,
              }),
            }),
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
              state.set('setError', (prev) =>
                prev.authState.type === AuthStateType.LOGGED_IN &&
                (!prev.authState.currentUser ||
                  (error instanceof ClientError && error.statusCode === 401))
                  ? {authState: {type: AuthStateType.ERROR, error}}
                  : prev,
              )
              return EMPTY
            }),
            map((currentUser) => ({currentUser, token})),
          )
      }),
    )

  return currentUser$.subscribe({
    next: ({currentUser, token}) => {
      logger.info('Current user fetched successfully', {
        hasEmail: !!currentUser.email,
      })
      // userId is PII, so only surface it at debug level
      logger.debug('Current user details', {userId: currentUser.id})
      state.set('setCurrentUser', (prev) => ({
        authState:
          prev.authState.type === AuthStateType.LOGGED_IN &&
          prev.authState.currentUser?.id !== currentUser.id
            ? {...prev.authState, currentUser}
            : prev.authState,
        currentUserToken: token,
      }))
    },
  })
}
