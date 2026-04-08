import {type DocumentResource, type SanityInstance} from '@sanity/sdk'
import {type ReactElement, type ReactNode, use, useMemo} from 'react'

import {useDashboardOrganizationId} from '../hooks/auth/useDashboardOrganizationId'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {resolveOrgResources} from '../utils/resolveOrgResources'
import {ResourcesContext} from './ResourcesContext'

const DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME = 'media-library'
const DEFAULT_CANVAS_RESOURCE_NAME = 'canvas'

interface OrgResourcePromises {
  mlPromise: PromiseLike<DocumentResource | undefined>
  canvasPromise: PromiseLike<DocumentResource | undefined>
}

// Module-level cache keyed by SanityInstance so Promise references are stable
// across Suspense unmount/remount cycles. React's use() tracks promises by
// identity, so stable references prevent unnecessary re-suspensions.
// WeakMap entries are GC'd when the instance is disposed.
const inferredResourceCache = new WeakMap<SanityInstance, Map<string, OrgResourcePromises>>()

function getOrgResourcePromises(
  instance: SanityInstance,
  organizationId: string,
): OrgResourcePromises {
  let orgCache = inferredResourceCache.get(instance)
  if (!orgCache) {
    orgCache = new Map()
    inferredResourceCache.set(instance, orgCache)
  }
  if (!orgCache.has(organizationId)) {
    const basePromise = resolveOrgResources(instance, organizationId).then(
      (result) => result,
      (error) => {
        // eslint-disable-next-line no-console
        console.warn('[sanity/sdk] Failed to infer org resources:', error)
        return {mediaLibrary: undefined, canvas: undefined}
      },
    )
    orgCache.set(organizationId, {
      mlPromise: basePromise.then((r) => r.mediaLibrary),
      canvasPromise: basePromise.then((r) => r.canvas),
    })
  }
  return orgCache.get(organizationId)!
}

/**
 * Inner component that suspends via use() until both inference promises settle.
 * Requires a Suspense boundary from the caller (usually a top ResourceProvider).
 */
function InferredResourcesProvider({
  instance,
  orgId,
  explicitResources,
  children,
}: {
  instance: SanityInstance
  orgId: string
  explicitResources: Record<string, DocumentResource>
  children: ReactNode
}): ReactElement {
  const {mlPromise, canvasPromise} = getOrgResourcePromises(instance, orgId)
  const ml = use(mlPromise)
  const canvas = use(canvasPromise)

  const resources = useMemo(() => {
    const inferred: Record<string, DocumentResource> = {}
    if (ml !== undefined) inferred[DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME] = ml
    if (canvas !== undefined) inferred[DEFAULT_CANVAS_RESOURCE_NAME] = canvas
    return {...inferred, ...explicitResources}
  }, [ml, canvas, explicitResources])

  return <ResourcesContext.Provider value={resources}>{children}</ResourcesContext.Provider>
}

/**
 * Merges explicit named resources with inferred org resources (media library, canvas).
 *
 * When `inferMediaLibraryAndCanvas` is set, this component suspends until
 * inference resolves. The nearest Suspense boundary (e.g. from ResourceProvider)
 * shows its fallback during that window.
 */
export function OrganizationResourcesProvider({
  resources: explicitResources = {},
  inferMediaLibraryAndCanvas,
  children,
}: {
  resources?: Record<string, DocumentResource>
  inferMediaLibraryAndCanvas?: boolean
  children: ReactNode
}): ReactElement {
  const instance = useSanityInstance()
  const orgId = useDashboardOrganizationId()

  if (!inferMediaLibraryAndCanvas || !orgId) {
    return (
      <ResourcesContext.Provider value={explicitResources}>{children}</ResourcesContext.Provider>
    )
  }

  return (
    <InferredResourcesProvider
      instance={instance}
      orgId={orgId}
      explicitResources={explicitResources}
    >
      {children}
    </InferredResourcesProvider>
  )
}
