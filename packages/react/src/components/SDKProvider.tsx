import {
  type DocumentResource,
  isDatasetResource,
  isImportError,
  type SanityConfig,
} from '@sanity/sdk'
import {type ReactElement, type ReactNode, useEffect, useMemo} from 'react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'

import {DEFAULT_RESOURCE_NAME} from '../constants'
import {OrganizationResourcesProvider} from '../context/OrganizationResourcesProvider'
import {ResourceProvider} from '../context/ResourceProvider'
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
  /** When set, automatically fetches and registers the organization's media library and canvas as named resources. */
  inferMediaLibraryAndCanvas?: boolean
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
  inferMediaLibraryAndCanvas,
  ...props
}: SDKProviderProps): ReactElement {
  // For legacy config support, extract the first config object as a default resource,
  // matching the legacy behavior nesting ResourceProviders with the first config closest to users' application code.
  // This should be removed when we remove legacy config support.
  const defaultConfig = Array.isArray(config) ? config[0] : config
  const defaultProjectId = defaultConfig?.projectId
  const defaultDataset = defaultConfig?.dataset

  const resourcesValue = useMemo(() => {
    const explicit = props.resources ?? {}
    if (defaultProjectId && defaultDataset && !Object.hasOwn(explicit, DEFAULT_RESOURCE_NAME)) {
      return {
        [DEFAULT_RESOURCE_NAME]: {
          projectId: defaultProjectId,
          dataset: defaultDataset,
        },
        ...explicit,
      }
    }
    return explicit
  }, [defaultProjectId, defaultDataset, props.resources])

  // Collect all projectIds from both resources and config, deduped so
  // AuthBoundary doesn't verify the same project more than once.
  const projectIds = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...Object.values(resourcesValue)
              .filter(isDatasetResource)
              .map((resource) => resource.projectId),
            ...(Array.isArray(config) ? config : [config]).map((configObj) => configObj.projectId),
          ].filter((id): id is string => !!id),
        ),
      ),
    [resourcesValue, config],
  )

  return (
    <ErrorBoundary FallbackComponent={ChunkAwareFallback}>
      <ResetChunkReloadFlagOnMount />
      {/* Spread the first config so SanityInstance can use the auth,
        perspective, and other config fields; `resource` lets an explicitly
        provided `default` resource override the config-derived resource. */}
      <ResourceProvider
        {...defaultConfig}
        resource={resourcesValue[DEFAULT_RESOURCE_NAME]}
        fallback={fallback}
      >
        <AuthBoundary {...props} projectIds={projectIds}>
          {/* OrganizationResourcesProvider wraps ResourcesContext.
            It merges explicit resources with lazily inferred org resources (media
            library, canvas) and provides the combined map to the subtree. */}
          <OrganizationResourcesProvider
            resources={resourcesValue}
            inferMediaLibraryAndCanvas={inferMediaLibraryAndCanvas}
          >
            {children}
          </OrganizationResourcesProvider>
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
