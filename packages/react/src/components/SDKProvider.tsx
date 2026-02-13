import {type DocumentSource, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode, useMemo} from 'react'

import {ResourceProvider} from '../context/ResourceProvider'
import {SourcesContext} from '../context/SourcesContext'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'

/**
 * @internal
 */
export interface SDKProviderProps extends AuthBoundaryProps {
  children: ReactNode
  config: SanityConfig | SanityConfig[]
  fallback: ReactNode
  sources?: Record<string, DocumentSource>
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
  // Memoize the reversed configs array so downstream providers receive stable
  // references between renders (avoids unnecessary re-subscriptions and instance
  // recreation in ResourceProvider / AuthBoundary).
  // Note: React Compiler should handle this automatically, but kept for explicit intent.
  const configs = useMemo(
    // reverse because we want the first config to be the default, but the
    // ResourceProvider nesting makes the last one the default
    () => (Array.isArray(config) ? config : [config]).slice().reverse(),
    [config],
  )

  // Memoize projectIds so AuthBoundary → useVerifyOrgProjects receives a stable
  // array reference rather than a new one on every render.
  // Note: React Compiler should handle this automatically, but kept for explicit intent.
  const projectIds = useMemo(
    () => configs.map((c) => c.projectId).filter((id): id is string => !!id),
    [configs],
  )

  // Memoize sources to prevent creating a new empty object on every render
  const sourcesValue = useMemo(() => props.sources ?? {}, [props.sources])

  // Create a nested structure of ResourceProviders for each config
  const createNestedProviders = (index: number): ReactElement => {
    if (index >= configs.length) {
      return (
        <AuthBoundary {...props} projectIds={projectIds}>
          <SourcesContext.Provider value={sourcesValue}>{children}</SourcesContext.Provider>
        </AuthBoundary>
      )
    }

    return (
      <ResourceProvider {...configs[index]} fallback={fallback}>
        {createNestedProviders(index + 1)}
      </ResourceProvider>
    )
  }

  return createNestedProviders(0)
}
