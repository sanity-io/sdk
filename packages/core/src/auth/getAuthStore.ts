import type {SanityInstance} from '../instance/types'
import {type AuthStore, createAuthStore} from './authStore'

/**
 * Retrieves or creates an `AuthStore` for the given `SanityInstance`.
 *
 * @param instance - The `SanityInstance` to get or create the `AuthStore` for.
 * @returns The `AuthStore` associated with the given `SanityInstance`.
 *
 * @public
 */
export const getAuthStore = (instance: SanityInstance): AuthStore => createAuthStore(instance)
