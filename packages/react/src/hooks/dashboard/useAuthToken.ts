import {useTopic} from './useTopic'

/**
 * Returns the session token for the reading connection, or `null` while signed out.
 *
 * Suspends until Dashboard publishes the token.
 *
 * @example
 * ```tsx
 * function AuthToken() {
 *   const token = useAuthToken()
 *   return <span>{token ?? 'Signed out'}</span>
 * }
 * ```
 *
 * @public
 */
export function useAuthToken(): string | null {
  return useTopic('auth.token')
}
