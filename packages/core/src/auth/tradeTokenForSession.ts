import {createClient} from '@sanity/client'

const AUTH_API_VERSION = 'v2024-12-03'

/**
 * Exchanges a temporary authentication token for a permanent session token
 * @public
 * @param {string} sessionId - Temporary session ID received from auth provider
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
export const tradeTokenForSession = async (sessionId: string): Promise<string | undefined> => {
  if (!sessionId) {
    return
  }

  /*
   * To authenticate, we don't want to call a "project" endpoint
   * (so, not like "https://{projectId}.api.sanity.io/etc/etc").
   * We want to get to "api.sanity.io" directly, so we use a client with no project.
   */
  const client = createClient({
    useCdn: false,
    apiVersion: AUTH_API_VERSION,
    withCredentials: false,
    useProjectHostname: false,
    ignoreBrowserTokenWarning: true,
  })

  const {token} = await client.request<{token: string}>({
    method: 'GET',
    uri: `/auth/fetch`,
    query: {sid: sessionId},
    tag: 'auth.fetch-token',
  })

  return token
}
