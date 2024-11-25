import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'

/**
 * Exchanges a temporary authentication token for a permanent session token
 * @public
 * @param {string} sessionId - Temporary session ID received from auth provider
 * @param {SanityInstance} sanityInstance - Configuration instance for the Sanity client
 * @returns {Promise<string | undefined>} Resolves to:
 *   - A permanent session token if exchange is successful
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
): Promise<string | undefined> => {
  const client = getClient({apiVersion: 'v2024-11-22'}, sanityInstance)
  if (!sessionId) {
    return
  }

  const {token} = await client.request<{token: string}>({
    method: 'GET',
    uri: `/auth/fetch`,
    query: {sid: sessionId},
    tag: 'auth.fetch-token',
  })

  return token
}
