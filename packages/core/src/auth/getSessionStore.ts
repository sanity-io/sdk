import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {createSessionStore, type SessionStore} from './sessionStore'

/**
 * Retrieves or creates a session store for managing authentication state.
 *
 * This function ensures only one session store exists per Sanity instance by using
 * the instance's resource management system. The session store is lazily instantiated
 * when first requested and then cached for subsequent calls.
 *
 * @public
 * @param instance - The Sanity client instance to associate the session store with
 * @returns A SessionStore instance that can be used to manage authentication state
 * @example
 * ```ts
 * const client = createClient({...})
 * const sessionStore = getSessionStore(client)
 * ```
 */
export const getSessionStore = (instance: SanityInstance): SessionStore => {
  const sessionStore = getOrCreateResource(instance, 'sessionStore', () => {
    return createSessionStore()
  })

  return sessionStore
}
