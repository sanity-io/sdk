import {type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {use} from 'react'

import {SanityInstanceContext} from '../../context/SanityInstanceContext'

/**
 * Retrieves the current Sanity instance or finds a matching instance from the hierarchy
 *
 * @public
 *
 * @category Platform
 * @param config - Optional configuration to match against when finding an instance
 * @returns The current or matching Sanity instance
 *
 * @remarks
 * This hook accesses the nearest Sanity instance from the React context. When provided with
 * a configuration object, it traverses up the instance hierarchy to find the closest instance
 * that matches the specified configuration using shallow comparison of properties.
 *
 * The hook must be used within a component wrapped by a `ResourceProvider` or `SanityApp`.
 *
 * Use this hook when you need to:
 * - Access the current SanityInstance from context
 * - Find a specific instance with matching project/dataset configuration
 * - Access a parent instance with specific configuration values
 *
 * @example Get the current instance
 * ```tsx
 * // Get the current instance from context
 * const instance = useSanityInstance()
 * console.log(instance.config.projectId)
 * ```
 *
 * @example Find an instance with specific configuration
 * ```tsx
 * // Find an instance matching the given project and dataset
 * const instance = useSanityInstance({
 *   projectId: 'abc123',
 *   dataset: 'production'
 * })
 *
 * // Use instance for API calls
 * const fetchDocument = (docId) => {
 *   // Instance is guaranteed to have the matching config
 *   return client.fetch(`*[_id == $id][0]`, { id: docId })
 * }
 * ```
 *
 * @example Match partial configuration
 * ```tsx
 * // Find an instance with specific auth configuration
 * const instance = useSanityInstance({
 *   auth: { requireLogin: true }
 * })
 * ```
 *
 * @throws Error if no SanityInstance is found in context
 * @throws Error if no matching instance is found for the provided config
 */
export const useSanityInstance = (config?: SanityConfig): SanityInstance => {
  const instance = use(SanityInstanceContext)

  if (!instance) {
    throw new Error(
      `SanityInstance context not found. ${config ? `Requested config: ${JSON.stringify(config, null, 2)}. ` : ''}Please ensure that your component is wrapped in a <ResourceProvider> or a <SanityApp>.`,
    )
  }

  if (!config) return instance

  const match = instance.match(config)
  if (!match) {
    throw new Error(
      `Could not find a matching Sanity instance for the requested configuration: ${JSON.stringify(config, null, 2)}.
Please ensure there is a <ResourceProvider> with a matching configuration in the component hierarchy.`,
    )
  }

  return match
}
