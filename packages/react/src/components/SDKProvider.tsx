import {
  DEFAULT_RESOURCE_NAME,
  type DocumentResource,
  isDatasetResource,
  type SanityConfig,
} from '@sanity/sdk'
import {type ReactElement, type ReactNode, useMemo} from 'react'

import {
  DEFAULT_CANVAS_RESOURCE_NAME,
  DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME,
  OrgInferenceContext,
} from '../context/OrgInferenceContext'
import {ResourceProvider} from '../context/ResourceProvider'
import {ResourcesContext} from '../context/ResourcesContext'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {resolveOrgResources} from '../utils/resolveOrgResources'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'

// Module-level cache keyed by SanityInstance so the inference promise
// survives Suspense unmount/remount cycles (React discards component state
// when showing a Suspense fallback). WeakMap ensures entries are GC'd
// when the instance is disposed and no longer referenced.
const inferredResourceCache = new WeakMap<
  object,
  Map<string, Promise<Record<string, DocumentResource>>>
>()

function getInferencePromise(
  instance: object,
  organizationId: string,
  create: () => Promise<Record<string, DocumentResource>>,
): Promise<Record<string, DocumentResource>> {
  let orgCache = inferredResourceCache.get(instance)
  if (!orgCache) {
    orgCache = new Map()
    inferredResourceCache.set(instance, orgCache)
  }
  if (!orgCache.has(organizationId)) {
    orgCache.set(organizationId, create())
  }
  return orgCache.get(organizationId)!
}

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
  inferOrganizationResourcesFrom?: string
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
 * Starts org resource inference by requesting the media library and canvas ids.
 *
 * This returns a promise so that the `use` call in `useNormalizedResourceOptions` can suspend.
 * This component itself does not suspend — the app renders immediately with explicit resources.
 *
 * Must be rendered inside a ResourceProvider so useSanityInstance() works.
 */
function OrgResourcesProvider({
  inferOrganizationResourcesFrom,
  explicitResources,
  children,
}: {
  inferOrganizationResourcesFrom?: string
  explicitResources: Record<string, DocumentResource>
  children: ReactNode
}): ReactElement {
  const instance = useSanityInstance()

  const inferencePromise = inferOrganizationResourcesFrom
    ? getInferencePromise(instance, inferOrganizationResourcesFrom, () =>
        resolveOrgResources(instance, inferOrganizationResourcesFrom).then(
          ({mediaLibrary, canvas}) => {
            const inferred: Record<string, DocumentResource> = {}
            if (mediaLibrary) inferred[DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME] = mediaLibrary
            if (canvas) inferred[DEFAULT_CANVAS_RESOURCE_NAME] = canvas
            return inferred
          },
          (error) => {
            // eslint-disable-next-line no-console
            console.warn('[sanity/sdk] Failed to infer org resources:', error)
            return {} as Record<string, DocumentResource>
          },
        ),
      )
    : null

  return (
    <OrgInferenceContext.Provider value={inferencePromise}>
      <ResourcesContext.Provider value={explicitResources}>{children}</ResourcesContext.Provider>
    </OrgInferenceContext.Provider>
  )
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
  inferOrganizationResourcesFrom,
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  const projectIds = useMemo(() => collectProjectIds(resources), [resources])

  const rootResource = useMemo(() => resources[DEFAULT_RESOURCE_NAME], [resources])

  return (
    <ResourceProvider {...config} resource={rootResource} fallback={fallback}>
      <AuthBoundary {...props} projectIds={projectIds}>
        <OrgResourcesProvider
          inferOrganizationResourcesFrom={inferOrganizationResourcesFrom}
          explicitResources={resources}
        >
          {children}
        </OrgResourcesProvider>
      </AuthBoundary>
    </ResourceProvider>
  )
}
