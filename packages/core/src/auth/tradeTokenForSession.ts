import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'
import {fetchSessionUser} from './fetchSessionUser'
import {getSessionStore} from './getSessionStore'
import {LOGGED_IN_STATES} from './sessionStore'

/**
 * Exchanges a temporary authentication token for a permanent session token
 * @public
 * @param {string} sessionId - Temporary session ID received from auth provider
 * @param {SanityInstance} sanityInstance - Configuration instance for the Sanity client
 * @returns {Promise<string | undefined>} Resolves to:
 *   - A long-lived session token if exchange is successful
 *   - undefined if sessionId is empty or exchange fails
 * @throws {Error} If the API request fails or returns invalid response
 * @example
 * ```ts
 * const sessionToken = await tradeTokenForSession('temp_session_123', sanityConfig)
 * // Returns: 'permanent_token_xyz'
 * ```
 */
export const tradeTokenForSession = async (
  sessionId: string,
  sanityInstance: SanityInstance,
  onSuccess?: () => void,
): Promise<string | undefined> => {
  if (!sessionId) {
    return
  }

  const client = getClient({apiVersion: 'v2024-11-22'}, sanityInstance)
  const sessionStore = getSessionStore(sanityInstance)
  sessionStore.getState().setLoggedInState(LOGGED_IN_STATES.LOADING)

  const {token} = await client.request<{token: string}>({
    method: 'GET',
    uri: `/auth/fetch`,
    query: {sid: sessionId},
    tag: 'auth.fetch-token',
  })

  getSessionStore(sanityInstance).getState().setSessionId(token)

  await fetchSessionUser(sanityInstance)
  sessionStore.getState().setLoggedInState(LOGGED_IN_STATES.LOGGED_IN)
  onSuccess?.()

  return token
}
