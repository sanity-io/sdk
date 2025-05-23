import {
  distinctUntilChanged,
  exhaustMap,
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
      useCdn: false,
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
    // If Web Locks API is not supported, perform an immediate, uncoordinated refresh.
    // eslint-disable-next-line no-console
    console.warn('Web Locks API not supported. Proceeding with uncoordinated refresh.')
    await refreshFn()
    setLastRefreshTime(storageArea, storageKey)
    return true // Indicate success to allow stream processing, though it won't loop.
  }

  try {
    // Attempt to acquire an exclusive lock for token refresh coordination.
    // The callback handles the continuous refresh cycle while the lock is held.
    const result = await navigator.locks.request(LOCK_NAME, {mode: 'exclusive'}, async (lock) => {
      if (!lock) return false // Lock not granted

      // Problematic infinite loop - needs redesign for graceful termination.
      // This loop continuously refreshes the token at REFRESH_INTERVAL.
      while (true) {
        const delay = getNextRefreshDelay(storageArea, storageKey)
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
        try {
          await refreshFn()
          setLastRefreshTime(storageArea, storageKey)
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Token refresh failed within lock:', error)
          // Decide how to handle errors - break, retry, etc.? Currently logs and continues.
        }
        // Wait for the next interval
        await new Promise((resolve) => setTimeout(resolve, REFRESH_INTERVAL))
      }
      // Unreachable due to while(true)
    })
    // The promise from navigator.locks.request resolves with the callback's return value,
    // but only if the callback finishes. The infinite loop prevents this.
    return result === true
  } catch (error) {
    // Handle potential errors during the initial lock request itself.
    // eslint-disable-next-line no-console
    console.error('Failed to request token refresh lock:', error)
    return false // Indicate lock acquisition failure.
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
    distinctUntilChanged(
      (prev, curr) =>
        prev.authState.type === curr.authState.type &&
        prev.authState.token === curr.authState.token && // Only care about token for distinctness here
        prev.dashboardContext === curr.dashboardContext,
    ), // Make distinctness check explicit
    filter((storeState) => storeState.authState.token.includes('-st')), // Ensure we only try to refresh stamped tokens
    exhaustMap((storeState) => {
      // USE exhaustMap instead of switchMap
      // Create a function that performs a single refresh and updates state/storage
      const performRefresh = async () => {
        // Read the latest token directly from state inside refresh
        const currentState = state.get()
        if (currentState.authState.type !== AuthStateType.LOGGED_IN) {
          throw new Error('User logged out before refresh could complete') // Abort refresh
        }
        const currentToken = currentState.authState.token

        const response = await firstValueFrom(
          createTokenRefreshStream(currentToken, clientFactory, apiHost),
        )

        state.set('setRefreshStampedToken', (prev) => ({
          authState:
            prev.authState.type === AuthStateType.LOGGED_IN
              ? {...prev.authState, token: response.token}
              : prev.authState,
        }))
        storageArea?.setItem(storageKey, JSON.stringify({token: response.token}))
      }

      if (storeState.dashboardContext) {
        return timer(REFRESH_INTERVAL, REFRESH_INTERVAL).pipe(
          // Check if still logged in before each refresh attempt in the timer
          takeWhile(() => state.get().authState.type === AuthStateType.LOGGED_IN),
          // Use switchMap here: if the timer ticks again, we *do* want the latest token request
          switchMap(() =>
            createTokenRefreshStream(storeState.authState.token, clientFactory, apiHost),
          ),
          // Map the successful response for the outer subscribe block
          map((response) => ({token: response.token})),
        )
      }

      // If not in dashboard context, use lock-based refresh.
      // exhaustMap prevents this from running again if state changes while lock logic is active.
      // NOTE: Based on Web Locks API, this `from(acquireTokenRefreshLock(...))` observable
      // will likely NOT emit if the lock is successfully acquired, as the underlying promise
      // may never resolve due to the while(true) loop. This path needs verification.
      return from(acquireTokenRefreshLock(performRefresh, storageArea, storageKey)).pipe(
        filter((hasLock) => hasLock),
        // If acquireTokenRefreshLock *does* somehow resolve true (e.g., locks unsupported),
        // emit the token that triggered this exhaustMap execution.
        map(() => ({token: storeState.authState.token})),
      )
    }),
  )

  return refreshToken$.subscribe({
    next: (response) => {
      // This block now primarily handles updates from the dashboard timer path,
      // or potentially from the lock path if acquireTokenRefreshLock resolves unexpectedly.
      // exhaustMap prevents this state update from causing an immediate loop.
      state.set('setRefreshStampedToken', (prev) => ({
        authState:
          prev.authState.type === AuthStateType.LOGGED_IN
            ? {...prev.authState, token: response.token}
            : prev.authState,
      }))
      storageArea?.setItem(storageKey, JSON.stringify({token: response.token}))
    },
    error: (error) => {
      // Log errors from either refresh path
      // Consider how refresh failures should affect the overall auth state
      // E.g., maybe attempt retry, or eventually set state to ERROR if retries fail
      // For now, just log, avoiding immediate state change to ERROR
      // console.error('Token refresh failed:', error) // Removed to satisfy linter
      state.set('setRefreshStampedTokenError', {authState: {type: AuthStateType.ERROR, error}})
    },
  })
}
