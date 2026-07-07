import {
  distinctUntilChanged,
  exhaustMap,
  filter,
  map,
  Observable,
  type Subscription,
  switchMap,
  takeWhile,
  timer,
} from 'rxjs'

import {type StoreContext} from '../store/defineStore'
import {DEFAULT_API_VERSION, REQUEST_TAG_PREFIX} from './authConstants'
import {getAuthLogger} from './authLogger'
import {AuthStateType} from './authStateType'
import {type AuthState, type AuthStoreState} from './authStore'

const REFRESH_INTERVAL = 12 * 60 * 60 * 1000 // 12 hours in milliseconds

function createTokenRefreshStream(
  token: string,
  clientFactory: AuthStoreState['options']['clientFactory'],
  apiHost: string | undefined,
): Observable<{token: string}> {
  return new Observable((subscriber) => {
    const client = clientFactory({
      apiVersion: DEFAULT_API_VERSION,
      requestTagPrefix: REQUEST_TAG_PREFIX,
      useProjectHostname: false,
      useCdn: false,
      token,
      ignoreBrowserTokenWarning: true,
      ...(apiHost && {apiHost}),
    })

    const subscription = client.observable
      .request<{token: string}>({
        uri: 'auth/refresh-token',
        method: 'POST',
        tag: 'refresh-token',
        body: {
          token,
        },
      })
      .subscribe(subscriber)

    return () => subscription.unsubscribe()
  })
}

function shouldRefreshToken(lastRefresh: number | undefined): boolean {
  if (!lastRefresh) return true
  const timeSinceLastRefresh = Date.now() - lastRefresh
  return timeSinceLastRefresh >= REFRESH_INTERVAL
}

/**
 * Periodically refreshes stamped auth tokens (those containing `-st`).
 *
 * Two triggers cause a refresh while the user stays logged in:
 * - a 12-hour interval timer (only fires while the tab is visible)
 * - the tab becoming visible again after `lastTokenRefresh` has gone stale
 *
 * Non-stamped tokens (e.g. personal access tokens) are never refreshed.
 *
 * @internal
 */
export const refreshStampedToken = ({
  state,
  instance,
}: StoreContext<AuthStoreState>): Subscription => {
  const logger = getAuthLogger(instance)

  const {clientFactory, apiHost, storageArea, storageKey} = state.get().options

  const refreshToken$ = state.observable.pipe(
    map((storeState) => storeState.authState),
    filter(
      (authState): authState is Extract<AuthState, {type: AuthStateType.LOGGED_IN}> =>
        authState.type === AuthStateType.LOGGED_IN,
    ),
    distinctUntilChanged((prev, curr) => prev.token === curr.token),
    filter((authState) => authState.token.includes('-st')), // Ensure we only try to refresh stamped tokens
    exhaustMap(() =>
      new Observable<{token: string}>((subscriber) => {
        const visibilityHandler = () => {
          const currentState = state.get()
          if (
            document.visibilityState === 'visible' &&
            currentState.authState.type === AuthStateType.LOGGED_IN &&
            shouldRefreshToken(currentState.authState.lastTokenRefresh)
          ) {
            createTokenRefreshStream(
              currentState.authState.token,
              clientFactory,
              apiHost,
            ).subscribe({
              next: (response) => {
                state.set('setRefreshStampedToken', (prev) => ({
                  authState:
                    prev.authState.type === AuthStateType.LOGGED_IN
                      ? {
                          ...prev.authState,
                          token: response.token,
                          lastTokenRefresh: Date.now(),
                        }
                      : prev.authState,
                }))
                subscriber.next(response)
              },
              error: (error) => subscriber.error(error),
            })
          }
        }

        const timerSubscription = timer(REFRESH_INTERVAL, REFRESH_INTERVAL)
          .pipe(
            filter(() => document.visibilityState === 'visible'),
            switchMap(() => {
              const currentState = state.get().authState
              if (currentState.type !== AuthStateType.LOGGED_IN) {
                throw new Error('User logged out before refresh could complete')
              }
              return createTokenRefreshStream(currentState.token, clientFactory, apiHost)
            }),
          )
          .subscribe({
            next: (response) => {
              state.set('setRefreshStampedToken', (prev) => ({
                authState:
                  prev.authState.type === AuthStateType.LOGGED_IN
                    ? {
                        ...prev.authState,
                        token: response.token,
                        lastTokenRefresh: Date.now(),
                      }
                    : prev.authState,
              }))
              subscriber.next(response)
            },
            error: (error) => subscriber.error(error),
          })

        document.addEventListener('visibilitychange', visibilityHandler)

        return () => {
          document.removeEventListener('visibilitychange', visibilityHandler)
          timerSubscription.unsubscribe()
        }
      }).pipe(
        takeWhile(() => state.get().authState.type === AuthStateType.LOGGED_IN),
        map((response: {token: string}) => ({token: response.token})),
      ),
    ),
  )

  return refreshToken$.subscribe({
    next: (response: {token: string}) => {
      logger.debug('Token refresh completed, updating state')
      state.set('setRefreshStampedToken', (prev) => ({
        authState:
          prev.authState.type === AuthStateType.LOGGED_IN
            ? {
                ...prev.authState,
                token: response.token,
                lastTokenRefresh: Date.now(),
              }
            : prev.authState,
      }))
      storageArea?.setItem(storageKey, JSON.stringify({token: response.token}))
    },
    error: (error) => {
      logger.error('Token refresh failed', {error})
      state.set('setRefreshStampedTokenError', {authState: {type: AuthStateType.ERROR, error}})
    },
  })
}
