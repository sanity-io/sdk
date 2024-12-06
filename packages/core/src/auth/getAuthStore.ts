import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {type AuthStore, createAuthStore} from './authStore'

/**
 * Retrieves or creates an `AuthStore` for the given `SanityInstance`.
 *
 * Ensures a single `AuthStore` instance is associated with the provided instance.
 * Creates a new store using the instance's configuration if none exists.
 *
 * @param instance - The `SanityInstance` to get or create the `AuthStore` for.
 * @returns The `AuthStore` associated with the given `SanityInstance`.
 *
 * @public
 */
export const getAuthStore = (instance: SanityInstance): AuthStore => {
  return getOrCreateResource(instance, 'authStore', () => {
    return createAuthStore(instance, instance.config?.auth)
  })
}
