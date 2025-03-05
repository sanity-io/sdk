import {createSanityInstance, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode} from 'react'

import {SanityProvider} from '../context/SanityProvider'
import {AuthBoundary} from './auth/AuthBoundary'

/**
 * @internal
 */
export interface SDKProviderProps {
  children: ReactNode
  sanityConfig: SanityConfig
}

// Marking this as internal since this should not be used directly by consumers
/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 */
export function SDKProvider({children, sanityConfig}: SDKProviderProps): ReactElement {
  const sanityInstance = createSanityInstance(sanityConfig)

  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <AuthBoundary>{children}</AuthBoundary>
    </SanityProvider>
  )
}
