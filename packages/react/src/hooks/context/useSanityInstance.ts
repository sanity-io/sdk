import type {SanityInstance} from '@sanity/sdk'
import {useContext} from 'react'

import {SanityInstanceContext} from '../../components/context/SanityProvider'

/**
 * Hook that provides the current Sanity instance from the context.
 * This must be called from within a `SanityProvider` component.
 * @public
 * @returns {SanityInstance} the current Sanity instance
 * @example
 * ```tsx
 * const instance = useSanityInstance()
 * ```
 */
export const useSanityInstance = (): SanityInstance => {
  const context = useContext(SanityInstanceContext)

  if (!context) throw new Error('useSanityInstance must be called from within the SanityProvider')

  const {sanityInstance} = context

  return sanityInstance
}
