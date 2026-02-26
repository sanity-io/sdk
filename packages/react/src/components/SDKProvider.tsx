import {type DocumentSource, isDatasetSource, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode, useMemo} from 'react'

import {ResourceProvider} from '../context/ResourceProvider'
import {SourcesContext} from '../context/SourcesContext'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'

/**
 * @internal
 */
export interface SDKProviderProps extends AuthBoundaryProps {
  children: ReactNode
  config: SanityConfig
  /**
   * Named document sources map. Provided to `SourcesContext` for
   * name-based source resolution in hooks.
   */
  sources?: Record<string, DocumentSource>
  fallback: ReactNode
}

/**
 * Collects unique project IDs from a sources map.
 */
function collectProjectIds(sources: Record<string, DocumentSource>): string[] {
  const ids = new Set<string>()
  for (const src of Object.values(sources)) {
    if (isDatasetSource(src)) ids.add(src.projectId)
  }
  return [...ids]
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 *
 * Creates a single `ResourceProvider` (and therefore a single `SanityInstance`)
 * for the given config. Source resolution is handled by `SourcesContext`
 * and the `"default"` named source.
 */
export function SDKProvider({
  children,
  config,
  sources = {},
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const projectIds = useMemo(() => collectProjectIds(sources), [sources])

  return (
    <ResourceProvider {...config} fallback={fallback}>
      <AuthBoundary {...props} projectIds={projectIds}>
        <SourcesContext.Provider value={sources}>{children}</SourcesContext.Provider>
      </AuthBoundary>
    </ResourceProvider>
  )
}
