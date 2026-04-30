import {type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {useContext} from 'react'

import {SanityInstanceContext} from '../../context/SanityInstanceContext'

/**
 * Retrieves the current Sanity instance from context
 *
 * @public
 *
 * @category Platform
 * @param config - Deprecated. Formerly used to match against the instance hierarchy.
 * @returns The current Sanity instance
 *
 * @remarks
 * This hook accesses the nearest Sanity instance from the React context.
 * The hook must be used within a component wrapped by a `ResourceProvider` or `SanityApp`.
 *
 * @example Get the current instance
 * ```tsx
 * const instance = useSanityInstance()
 * console.log(instance.config.projectId)
 * ```
 *
 * @throws Error if no SanityInstance is found in context
 */
export const useSanityInstance = (
  /**
   * @deprecated Passing a config to match against the instance hierarchy is deprecated.
   * Use `useSanityInstance()` without arguments instead.
   */
  config?: SanityConfig,
): SanityInstance => {
  const instance = useContext(SanityInstanceContext)

  if (!instance) {
    throw new Error(
      `SanityInstance context not found. Please ensure that your component is wrapped in a ResourceProvider or a SanityApp component.`,
    )
  }

  if (config !== undefined) {
    // eslint-disable-next-line no-console
    console.warn(
      '[sanity] The `config` parameter of `useSanityInstance` is deprecated. Use `useSanityInstance()` without arguments instead.',
    )
  }

  return instance
}
