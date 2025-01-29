import {createSanityInstance, type SanityConfig} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {type JSX} from 'react'

import {AuthBoundary} from './auth/AuthBoundary'

/**
 * @public
 *
 * @returns Rendered child component wrapped in a SanityProvider and AuthBoundary
 */
export function SanityApp({
  sanityConfig,
  children,
}: {
  children: React.ReactNode
  sanityConfig: SanityConfig
}): JSX.Element {
  const sanityInstance = createSanityInstance(sanityConfig)

  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <AuthBoundary>{children}</AuthBoundary>
    </SanityProvider>
  )
}
