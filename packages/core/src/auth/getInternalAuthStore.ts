import {getOrCreateResource} from '../instance/sanityInstance'
import type {SanityInstance} from '../instance/types'
import {createInternalAuthStore, type InternalAuthStore} from './internalAuthStore'

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
export const getInternalAuthStore = (instance: SanityInstance): InternalAuthStore => {
  return getOrCreateResource(instance, 'authStore', () => {
    return createInternalAuthStore(instance, instance.config?.auth)
  })
}
