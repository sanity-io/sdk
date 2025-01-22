import {createSanityInstance, type SanityConfig} from '@sanity/sdk'
import {type JSX} from 'react'

import {SanityProvider} from '../context/SanityProvider'
import {AuthBoundary} from './auth/AuthBoundary'

export function SanityApp({
  sanityConfig,
  children,
}: {
  children?: React.ReactNode
  sanityConfig: SanityConfig
}): JSX.Element {
  const sanityInstance = createSanityInstance(sanityConfig)

  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <AuthBoundary>{children}</AuthBoundary>
    </SanityProvider>
  )
}
