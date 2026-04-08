import {type DocumentResource, isDatasetResource, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, type ReactNode, useMemo} from 'react'

import {OrganizationResourcesProvider} from '../context/OrganizationResourcesProvider'
import {ResourceProvider} from '../context/ResourceProvider'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'
import {DEFAULT_RESOURCE_NAME} from './utils'

/**
 * @internal
 */
export interface SDKProviderProps extends AuthBoundaryProps {
  children: ReactNode
  config: SanityConfig
  /**
   * Named document resources map. Provided to `ResourcesContext` for
   * name-based resource resolution in hooks.
   */
  resources?: Record<string, DocumentResource>
  /** When set, automatically fetches and registers the organization's media library and canvas as named resources. */
  inferMediaLibraryAndCanvas?: boolean
  fallback: ReactNode
}

/**
 * Collects unique project IDs from a resources map.
 */
function collectProjectIds(resources: Record<string, DocumentResource>): string[] {
  const ids = new Set<string>()
  for (const res of Object.values(resources)) {
    if (isDatasetResource(res)) ids.add(res.projectId)
  }
  return [...ids]
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 *
 * Creates a single `ResourceProvider` (and therefore a single `SanityInstance`)
 * for the given config. Resource resolution is handled by `ResourcesContext`
 * and the `"default"` named resource.
 */
export function SDKProvider({
  children,
  config,
  resources = {},
  inferMediaLibraryAndCanvas,
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const projectIds = useMemo(() => collectProjectIds(resources), [resources])

  const rootResource = useMemo(() => resources[DEFAULT_RESOURCE_NAME], [resources])

  return (
    <ResourceProvider {...config} resource={rootResource} fallback={fallback}>
      <AuthBoundary {...props} projectIds={projectIds}>
        {/* OrganizationResourcesProvider wraps ResourcesContext.
            It merges explicit resources with lazily inferred org resources (media
            library, canvas) and provides the combined map to the subtree. */}
        <OrganizationResourcesProvider
          resources={resources}
          inferMediaLibraryAndCanvas={inferMediaLibraryAndCanvas}
        >
          {children}
        </OrganizationResourcesProvider>
      </AuthBoundary>
    </ResourceProvider>
  )
}
