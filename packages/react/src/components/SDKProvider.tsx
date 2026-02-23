import {
  type DocumentSource,
  getDefaultProjectId,
  isDatasetSource,
  type SanityConfig,
} from '@sanity/sdk'
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
}

/**
 * Builds the merged sources map from all configs' `sources` fields.
 * Later configs override earlier ones for the same key.
 */
function buildSourcesMap(configs: SanityConfig[]): Record<string, DocumentSource> {
  const merged: Record<string, DocumentSource> = {}
  for (const cfg of configs) {
    if (cfg.sources) Object.assign(merged, cfg.sources)
  }
  return merged
}

/**
 * Collects unique project IDs from all configs' default sources.
 */
function collectProjectIds(configs: SanityConfig[]): string[] {
  const ids = new Set<string>()
  for (const cfg of configs) {
    const id = getDefaultProjectId(cfg)
    if (id) ids.add(id)
    if (cfg.sources) {
      for (const src of Object.values(cfg.sources)) {
        if (isDatasetSource(src)) ids.add(src.projectId)
      }
    }
  }
  return [...ids]
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 *
 * Creates a `ResourceProvider` (and therefore a `SanityInstance`) for each
 * config entry. Source resolution is handled entirely by `SourcesContext`
 * and the `"default"` named source — it does not depend on provider nesting.
 */
export function SDKProvider({
  children,
  config,
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const configs = useMemo(() => (Array.isArray(config) ? config : [config]), [config])
  const projectIds = useMemo(() => collectProjectIds(configs), [configs])

  const sourcesValue = useMemo(() => buildSourcesMap(configs), [configs])

  const createNestedProviders = (index: number): ReactElement => {
    if (index < 0) {
      return (
        <AuthBoundary {...props} projectIds={projectIds}>
          <SourcesContext.Provider value={sourcesValue}>{children}</SourcesContext.Provider>
        </AuthBoundary>
      )
    }

    return (
      <ResourceProvider {...configs[index]} fallback={fallback}>
        {createNestedProviders(index - 1)}
      </ResourceProvider>
    )
  }

  return createNestedProviders(configs.length - 1)
}
