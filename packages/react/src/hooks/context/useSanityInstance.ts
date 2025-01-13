import {type SanityInstance} from '@sanity/sdk'
import {useContext} from 'react'

import {SanityInstanceContext} from '../../components/context/SanityProvider'

/**
 * Hook that provides the current Sanity instance from the context.
 * This must be called from within a `SanityProvider` component.
 * @public
 * @returns the current Sanity instance
 * @example
 * ```tsx
 * const instance = useSanityInstance()
 * ```
 */
export const useSanityInstance = (): SanityInstance => {
  const sanityInstance = useContext(SanityInstanceContext)
  if (!sanityInstance) {
    throw new Error('useSanityInstance must be called from within the SanityProvider')
  }

  return sanityInstance
}
