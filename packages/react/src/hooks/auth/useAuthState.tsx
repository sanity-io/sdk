import {type AuthState, getAuthState} from '@sanity/sdk'

import {createStateSourceHook} from '../helpers/createStateSourceHook'

/**
 * @internal
 * A React hook that subscribes to authentication state changes.
 *
 * This hook provides access to the current authentication state type from the Sanity auth store.
 * It automatically re-renders when the authentication state changes.
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
 */
export const useAuthState: () => AuthState = createStateSourceHook(getAuthState)
