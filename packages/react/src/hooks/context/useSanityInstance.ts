import {type SanityInstance} from '@sanity/sdk'
import {useContext} from 'react'

import {SanityInstanceContext} from '../../context/SanityProvider'

/**
 * `useSanityInstance` returns the current Sanity instance from the application context.
 * This must be called from within a `SanityProvider` component.
 * @internal
 *
 * @param resourceId - The resourceId of the Sanity instance to return (optional)
 * @returns The current Sanity instance
 * @example
 * ```tsx
 * const instance = useSanityInstance('abc123.production')
 * ```
 */
export const useSanityInstance = (resourceId?: string): SanityInstance => {
  const sanityInstance = useContext(SanityInstanceContext)
  if (!sanityInstance) {
    throw new Error('useSanityInstance must be called from within the SanityProvider')
  }
  if (sanityInstance.length === 0) {
    throw new Error('No Sanity instances found')
  }
  if (sanityInstance.length === 1 || !resourceId) {
    return sanityInstance[0]
  }

  if (!resourceId) {
    throw new Error('resourceId is required when there are multiple Sanity instances')
  }

  const instance = sanityInstance.find((inst) => inst.identity.resourceId === resourceId)
  if (!instance) {
    throw new Error(`Sanity instance with resourceId ${resourceId} not found`)
  }
  return instance
}
