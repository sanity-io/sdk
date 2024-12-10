import {type AuthState, getAuthStore} from '@sanity/sdk'
import {useStore} from 'zustand/react'

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
export function useAuthState(): AuthState {
  const instance = useSanityInstance()
  const {authState} = getAuthStore(instance)

  return useStore(authState)
}
