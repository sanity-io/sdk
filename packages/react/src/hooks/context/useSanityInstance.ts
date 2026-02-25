import {type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {useContext} from 'react'

import {SanityInstanceContext} from '../../context/SanityInstanceContext'

/**
 * Retrieves the current Sanity instance and optionally validates its config.
 *
 * @public
 *
 * @category Platform
 * @param config - Optional configuration to validate against the current instance
 * @returns The current instance
 *
 * @remarks
 * This hook accesses the nearest Sanity instance from React context.
 * When provided with a configuration object, it validates that the current
 * instance matches the requested config and throws otherwise.
 *
 * The hook must be used within a component wrapped by a `ResourceProvider` or `SanityApp`.
 *
 * Use this hook when you need to:
 * - Access the current SanityInstance from context
 * - Validate that the current instance has expected configuration values
 *
 * @example Get the current instance
 * ```tsx
 * const instance = useSanityInstance()
 * console.log(instance.config.sources)
 * ```
 *
 * @example Match by auth configuration
 * ```tsx
 * const instance = useSanityInstance({
 *   auth: { requireLogin: true }
 * })
 * ```
 *
 * @throws Error if no SanityInstance is found in context
 * @throws Error if the current instance does not match the provided config
 */
export const useSanityInstance = (config?: SanityConfig): SanityInstance => {
  const instance = useContext(SanityInstanceContext)

  if (!instance) {
    throw new Error(
      `SanityInstance context not found. ${config ? `Requested config: ${JSON.stringify(config, null, 2)}. ` : ''}Please ensure that your component is wrapped in a ResourceProvider or a SanityApp component.`,
    )
  }

  if (!config) return instance

  // Hooks may pass operation handles that include non-SanityConfig fields
  // (e.g. source/projectId/dataset/perspective). Only match against structural
  // config keys that identify an instance — perspective is a query-time option
  // and should not constrain instance selection.
  const sanitizedConfig: SanityConfig = {
    ...(config.auth && {auth: config.auth}),
    ...(config.sources && {sources: config.sources}),
    ...(config.studio && {studio: config.studio}),
  }

  const match = instance.match(sanitizedConfig)
  if (!match) {
    throw new Error(
      `Current Sanity instance does not match the requested configuration: ${JSON.stringify(config, null, 2)}.`,
    )
  }

  return match
}
