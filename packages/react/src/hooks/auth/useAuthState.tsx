import {type AuthState, getAuthStore} from '@sanity/sdk'
import {useSyncExternalStore} from 'react'
import {distinctUntilChanged, map, Observable} from 'rxjs'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * A React hook that subscribes to authentication state changes.
 *
 * This hook provides access to the current authentication state type from the Sanity auth store.
 * It automatically re-renders the component when the authentication state changes.
 *
 * @remarks
 * The hook uses `useSyncExternalStore` to safely subscribe to auth state changes
 * and ensure consistency between server and client rendering.
 *
 * @returns The current authentication state type
 *
 * @example
 * ```tsx
 * function AuthStatus() {
 *   const authState = useAuthState()
 *   return <div>Current auth state: {authState}</div>
 * }
 * ```
 *
 * @public
 */
export function useAuthState(): AuthState['type'] {
  const instance = useSanityInstance()
  const authStore = getAuthStore(instance)

  const subscribe = (onStoreChange: () => void) => {
    // Use Observable to handle auth state subscription and cleanup
    // distinctUntilChanged ensures we only trigger for actual type changes
    const subscription = new Observable(authStore.subscribe)
      .pipe(
        map((authState) => authState.type),
        distinctUntilChanged(),
      )
      .subscribe(() => onStoreChange())
    return () => subscription.unsubscribe()
  }

  // Synchronously get current auth state type without subscription
  const getState = () => authStore.getCurrent().type

  return useSyncExternalStore(subscribe, getState)
}
