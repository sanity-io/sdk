import {type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode} from 'react'

import {ResourceProvider} from '../context/ResourceProvider'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'

/**
 * @internal
 */
export interface SDKProviderProps extends AuthBoundaryProps {
  children: ReactNode
  config: SanityConfig | SanityConfig[]
  fallback: ReactNode
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 * Creates a hierarchy of ResourceProviders, each providing a SanityInstance that can be
 * accessed by hooks. The first configuration in the array becomes the default instance.
 */
export function SDKProvider({
  children,
  config,
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  // reverse because we want the first config to be the default, but the
  // ResourceProvider nesting makes the last one the default
  const configs = (Array.isArray(config) ? config : [config]).slice().reverse()

  // Create a nested structure of ResourceProviders for each config
  const createNestedProviders = (index: number): ReactElement => {
    if (index >= configs.length) {
      return <AuthBoundary {...props}>{children}</AuthBoundary>
    }

    return (
      <ResourceProvider {...configs[index]} fallback={fallback}>
        {createNestedProviders(index + 1)}
      </ResourceProvider>
    )
  }

  return createNestedProviders(0)
}
