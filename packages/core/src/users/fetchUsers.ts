/**
 * This is the lowest level, where there is no caching, stores etc involved.
 * @todo remove comment as we're maturing
 */
import {type SanityClient} from '@sanity/client'

import {getClient} from '../client/getClient.js'
import type {SanityInstance} from '../instance/types.js'
import type {User} from './types.js'

/**
 * User IDs are generally 9 bytes long, but external user IDs may be longer.
 * In order to keep the HTTP header size below ~8KB, we limit the batch size.
 * ~4kB for user IDs in paths should allow for plenty of headers, if need be.
 */
const MAX_BATCH_SIZE = 400

/**
 * Note: Ensure this is in sync with the `User` type!
 */
const USERS_API_VERSION = '2024-11-01'

/**
 * @todo should we provide a special case for `<system>` or does that belong in another layer?
 * @thoughtLevel 4 - Context TBD, but shape is fairly set.
 */
export async function fetchUsers(userIds: string[], instance: SanityInstance): Promise<User[]> {
  /**
   * Discovery thought: We may want to use DataLoader or a subset of it (extract the code or remake):
   * - Max batch size
   * - Avoid multiple calls within the same microtask
   */
  const chunks: string[][] = []
  for (let i = 0; i < userIds.length; i += MAX_BATCH_SIZE) {
    chunks.push(userIds.slice(i, i + MAX_BATCH_SIZE))
  }

  const client = getClient({apiVersion: USERS_API_VERSION}, instance)
  const userChunks = await Promise.all(chunks.map((chunk) => requestUsers(chunk, client)))

  return userChunks.flat()
}

async function requestUsers(userIds: string[], client: SanityClient): Promise<User[]> {
  const users = await client.request({
    uri: `/users/${userIds.join(',')}`,
    tag: 'users.get',
    withCredentials: true,
  })
  // If only a single ID is provided, the API will return an object instead of an array
  return Array.isArray(users) ? users : [users]
}
