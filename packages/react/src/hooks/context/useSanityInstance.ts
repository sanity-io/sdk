import {type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {useContext} from 'react'

import {SanityInstanceContext} from '../../context/SanityInstanceContext'

const warnedCallers = new Set<string>()

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
  if (config !== undefined) {
    const caller = new Error().stack?.split('\n')[2]?.trim() ?? 'unknown'
    if (!warnedCallers.has(caller)) {
      warnedCallers.add(caller)
      // eslint-disable-next-line no-console
      console.warn(
        '[useSanityInstance] Passing a config argument is deprecated and has no effect. ' +
          'SDK apps use a single instance for all resources, so the config argument is no longer needed. ' +
          'Call useSanityInstance() without arguments instead, or useResource() to get your currently active resource.',
      )
    }
  }

  const instance = useContext(SanityInstanceContext)

  if (!instance) {
    throw new Error(
      `SanityInstance context not found. Please ensure that your component is wrapped in a ResourceProvider or a SanityApp component.`,
    )
  }

  return instance
}
