import {isDatasetSource, type SanityConfig} from '@sanity/sdk'
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
  fallback: ReactNode
}

/**
 * Collects unique project IDs from a config's sources.
 */
function collectProjectIds(config: SanityConfig): string[] {
  const ids = new Set<string>()
  if (config.sources) {
    for (const src of Object.values(config.sources)) {
      if (isDatasetSource(src)) ids.add(src.projectId)
    }
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
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const projectIds = useMemo(() => collectProjectIds(config), [config])
  const sourcesValue = useMemo(() => config.sources ?? {}, [config])

  return (
    <ResourceProvider {...config} fallback={fallback}>
      <AuthBoundary {...props} projectIds={projectIds}>
        <SourcesContext.Provider value={sourcesValue}>{children}</SourcesContext.Provider>
      </AuthBoundary>
    </ResourceProvider>
  )
}
