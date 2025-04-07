import {
  distinctUntilChanged,
  filter,
  firstValueFrom,
  from,
  map,
  Observable,
  type Subscription,
  switchMap,
  takeWhile,
  timer,
} from 'rxjs'

import {type StoreContext} from '../store/defineStore'
import {DEFAULT_API_VERSION} from './authConstants'
import {AuthStateType} from './authStateType'
import {type AuthState, type AuthStoreState} from './authStore'

const REFRESH_INTERVAL = 12 * 60 * 60 * 1000 // 12 hours in milliseconds
const LOCK_NAME = 'sanity-token-refresh-lock'

function getLastRefreshTime(storageArea: Storage | undefined, storageKey: string): number {
  try {
    const data = storageArea?.getItem(`${storageKey}_last_refresh`)
    return data ? parseInt(data, 10) : 0
  } catch {
    return 0
  }
}

function setLastRefreshTime(storageArea: Storage | undefined, storageKey: string): void {
  try {
    storageArea?.setItem(`${storageKey}_last_refresh`, Date.now().toString())
  } catch {
    // Ignore storage errors
  }
}

function getNextRefreshDelay(storageArea: Storage | undefined, storageKey: string): number {
  const lastRefresh = getLastRefreshTime(storageArea, storageKey)
  if (!lastRefresh) return 0

  const now = Date.now()
  const nextRefreshTime = lastRefresh + REFRESH_INTERVAL
  return Math.max(0, nextRefreshTime - now)
}

function createTokenRefreshStream(
  token: string,
  clientFactory: AuthStoreState['options']['clientFactory'],
  apiHost: string | undefined,
): Observable<{token: string}> {
  return new Observable((subscriber) => {
    const client = clientFactory({
      apiVersion: DEFAULT_API_VERSION,
      requestTagPrefix: 'sdk.token-refresh',
      useProjectHostname: false,
      token,
      ignoreBrowserTokenWarning: true,
      ...(apiHost && {apiHost}),
    })

    const subscription = client.observable
      .request<{token: string}>({
        uri: 'auth/refresh-token',
        method: 'POST',
        body: {
          token,
        },
      })
      .subscribe(subscriber)

    return () => subscription.unsubscribe()
  })
}

async function acquireTokenRefreshLock(
  refreshFn: () => Promise<void>,
  storageArea: Storage | undefined,
  storageKey: string,
): Promise<boolean> {
  if (!navigator.locks) {
    return true // If Web Locks API is not supported, proceed with refresh
  }

  try {
    // Hold the lock for the entire session
    const result = await navigator.locks.request(LOCK_NAME, {mode: 'exclusive'}, async (lock) => {
      if (!lock) return false

      // Start a continuous refresh cycle while we hold the lock
      while (true) {
        const delay = getNextRefreshDelay(storageArea, storageKey)
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        await refreshFn()
        setLastRefreshTime(storageArea, storageKey)
        await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL))
      }
    })
    return result === true
  } catch {
    return false // If lock acquisition fails, return false
  }
}

/**
 * @internal
 */
export const refreshStampedToken = ({state}: StoreContext<AuthStoreState>): Subscription => {
  const {clientFactory, apiHost, storageArea, storageKey} = state.get().options

  const refreshToken$ = state.observable.pipe(
    map((storeState) => ({
      authState: storeState.authState,
      dashboardContext: storeState.dashboardContext,
    })),
    filter(
      (
        storeState,
      ): storeState is {
        authState: Extract<AuthState, {type: AuthStateType.LOGGED_IN}>
        dashboardContext: AuthStoreState['dashboardContext']
      } => storeState.authState.type === AuthStateType.LOGGED_IN,
    ),
    distinctUntilChanged(),
    filter((storeState) => storeState.authState.token.includes('-st')), // Ensure we only try to refresh stamped tokens
    switchMap((storeState) => {
      // Create a function that performs a single refresh
      const performRefresh = async () => {
        const response = await firstValueFrom(
          createTokenRefreshStream(storeState.authState.token, clientFactory, apiHost),
        )

        state.set('setRefreshStampedToken', (prev) => ({
          authState:
            prev.authState.type === AuthStateType.LOGGED_IN
              ? {...prev.authState, token: response.token}
              : prev.authState,
        }))
        storageArea?.setItem(storageKey, JSON.stringify({token: response.token}))
      }

      // If in dashboard context, use simple timer-based refresh
      if (storeState.dashboardContext) {
        return timer(0, REFRESH_INTERVAL).pipe(
          takeWhile(() => storeState.authState.type === AuthStateType.LOGGED_IN),
          switchMap(() =>
            createTokenRefreshStream(storeState.authState.token, clientFactory, apiHost),
          ),
        )
      }

      // If not in dashboard context, use lock-based refresh with timing coordination
      return from(acquireTokenRefreshLock(performRefresh, storageArea, storageKey)).pipe(
        filter((hasLock) => hasLock),
        // This observable will never emit after the first value
        // because acquireTokenRefreshLock handles the refresh loop internally
        map(() => ({token: storeState.authState.token})),
      )
    }),
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
