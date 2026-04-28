import {type DocumentResource, isImportError, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode, useEffect, useMemo} from 'react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'

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
  const projectIds = configs.map((c) => c.projectId).filter((id): id is string => !!id)

  // Memoize resources to prevent creating a new empty object on every render
  const resourcesValue = useMemo(() => props.resources ?? {}, [props.resources])

  // Create a nested structure of ResourceProviders for each config
  const createNestedProviders = (index: number): ReactElement => {
    if (index >= configs.length) {
      return (
        <AuthBoundary {...props} projectIds={projectIds}>
          <ResourcesContext.Provider value={resourcesValue}>{children}</ResourcesContext.Provider>
        </AuthBoundary>
      )
    }

    return (
      <ResourceProvider {...configs[index]} fallback={fallback}>
        {createNestedProviders(index + 1)}
      </ResourceProvider>
    )
  }

  return (
    <ErrorBoundary FallbackComponent={ChunkAwareFallback}>
      <ResetChunkReloadFlagOnMount />
      {createNestedProviders(0)}
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
