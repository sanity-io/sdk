import {type SanityInstance} from '@sanity/sdk'
import {useContext} from 'react'

import {SanityInstanceContext} from '../../context/SanityInstanceContext'

/**
 * Retrieves the current Sanity instance from context
 *
 * @public
 *
 * @category Platform
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
export const useSanityInstance = (): SanityInstance => {
  const instance = useContext(SanityInstanceContext)

  if (!instance) {
    throw new Error(
      `SanityInstance context not found. Please ensure that your component is wrapped in a ResourceProvider or a SanityApp component.`,
    )
  }

  return instance
}
