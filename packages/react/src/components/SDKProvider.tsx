import {createSanityInstance, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode, Suspense, useMemo} from 'react'

import {SanityProvider} from '../context/SanityProvider'
import {AuthBoundary} from './auth/AuthBoundary'

const DEFAULT_FALLBACK = (
  <>
    Warning: No fallback provided. Please supply a fallback prop to ensure proper Suspense handling.
  </>
)

/**
 * @internal
 */
export interface SDKProviderProps {
  children: ReactNode
  sanityConfigs: SanityConfig[]
  fallback: ReactNode
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 */
export function SDKProvider({children, sanityConfigs, fallback}: SDKProviderProps): ReactElement {
  const sanityInstances = useMemo(() => {
    return sanityConfigs.map((sanityConfig: SanityConfig) => createSanityInstance(sanityConfig))
  }, [sanityConfigs])

  return (
    <SanityProvider sanityInstances={sanityInstances}>
      {/* This Suspense boundary is necessary because some hooks may suspend.
      It ensures that the Sanity instance state created above remains stable
      before rendering the AuthBoundary and its children. */}
      <Suspense fallback={fallback ?? DEFAULT_FALLBACK}>
        <AuthBoundary>{children}</AuthBoundary>
      </Suspense>
    </SanityProvider>
  )
}
