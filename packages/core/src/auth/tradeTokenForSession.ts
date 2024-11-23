import {getClient} from '../client/getClient'
import type {SanityInstance} from '../instance/types'

/**
 * Trade a github/google/sanity token for a session ID
 * @public
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
