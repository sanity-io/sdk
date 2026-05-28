import {type DocumentResource, isImportError, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode, useEffect, useMemo} from 'react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'

import {DEFAULT_RESOURCE_NAME} from '../constants'
import {ResourceProvider} from '../context/ResourceProvider'
import {ResourcesContext} from '../context/ResourcesContext'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'
import {ChunkLoadError} from './errors/ChunkLoadError'
import {clearChunkReloadFlag} from './errors/chunkReloadStorage'

/**
 * @internal
 */
export interface SDKProviderProps extends AuthBoundaryProps {
  children: ReactNode
  config: SanityConfig | SanityConfig[]
  fallback: ReactNode
  resources?: Record<string, DocumentResource>
}

/**
 * Clears the chunk-reload flag once children render successfully past the
 * top-level boundary, so a future incident in the same session can trigger
 * another automatic reload.
 */
function ResetChunkReloadFlagOnMount(): null {
  useEffect(() => {
    clearChunkReloadFlag()
  }, [])
  return null
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 */
export function SDKProvider({
  children,
  config,
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const allConfigs = Array.isArray(config) ? config : [config]
  const resolvedConfig = allConfigs[0]
  const projectIds = allConfigs.map((c) => c.projectId).filter((id): id is string => !!id)

  // Extract static fields so the memo below doesn't take a reference dependency
  // on `config` — inline config objects change identity on every render.
  const singleConfig = Array.isArray(config) ? null : config
  const defaultProjectId = singleConfig?.projectId
  const defaultDataset = singleConfig?.dataset

  // For a single config, synthesize a 'default' resource from its projectId/dataset
  // so that hooks can resolve it via resourceName: 'default' or fall back to it
  // automatically when no resource info is provided.
  const resourcesValue = useMemo(() => {
    const explicit = props.resources ?? {}
    if (defaultProjectId && defaultDataset && !Object.hasOwn(explicit, DEFAULT_RESOURCE_NAME)) {
      return {
        [DEFAULT_RESOURCE_NAME]: {projectId: defaultProjectId, dataset: defaultDataset},
        ...explicit,
      }
    }
    return explicit
  }, [defaultProjectId, defaultDataset, props.resources])

  return (
    <ErrorBoundary FallbackComponent={ChunkAwareFallback}>
      <ResetChunkReloadFlagOnMount />
      <ResourceProvider {...resolvedConfig} fallback={fallback}>
        <AuthBoundary {...props} projectIds={projectIds}>
          <ResourcesContext.Provider value={resourcesValue}>{children}</ResourcesContext.Provider>
        </AuthBoundary>
      </ResourceProvider>
    </ErrorBoundary>
  )
}

function ChunkAwareFallback(fallbackProps: FallbackProps): ReactElement {
  if (isImportError(fallbackProps.error)) {
    return <ChunkLoadError {...fallbackProps} />
  }
  // Re-throw so downstream boundaries (e.g. AuthBoundary) handle other errors.
  throw fallbackProps.error
}
