import {type DocumentResource, type SanityInstance} from '@sanity/sdk'
import {type ReactElement, type ReactNode, use, useMemo} from 'react'

import {useDashboardOrganizationId} from '../hooks/auth/useDashboardOrganizationId'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {resolveOrgResources} from '../utils/resolveOrgResources'
import {ResourcesContext} from './ResourcesContext'

const DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME = 'media-library'
const DEFAULT_CANVAS_RESOURCE_NAME = 'canvas'

type OrgResource = typeof DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME | typeof DEFAULT_CANVAS_RESOURCE_NAME
type OrgResourcePromises = Map<OrgResource, PromiseLike<DocumentResource | undefined>>

// Module-level cache keyed by SanityInstance so Promise references are stable
// across Suspense unmount/remount cycles. React's use() tracks promises by
// identity, so stable references prevent unnecessary re-suspensions.
// WeakMap entries are GC'd when the instance is disposed.
// There is only ever one org at a time, so the instance alone is a sufficient
// key — organizationId only scopes the fetch, it doesn't need to key the cache.
const inferredResourceCache = new WeakMap<SanityInstance, OrgResourcePromises>()

function getOrgResourcePromises(
  instance: SanityInstance,
  organizationId: string,
): OrgResourcePromises {
  let promises = inferredResourceCache.get(instance)
  if (!promises) {
    const basePromise = resolveOrgResources(instance, organizationId).then(
      (result) => result,
      (error) => {
        // eslint-disable-next-line no-console
        console.warn('[sanity/sdk] Failed to infer org resources:', error)
        return {mediaLibrary: undefined, canvas: undefined}
      },
    )
    promises = new Map([
      [DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME, basePromise.then((r) => r.mediaLibrary)],
      [DEFAULT_CANVAS_RESOURCE_NAME, basePromise.then((r) => r.canvas)],
    ])
    inferredResourceCache.set(instance, promises)
  }

  return promises
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
  const promises = getOrgResourcePromises(instance, orgId)
  const ml = use(promises.get(DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME)!)
  const canvas = use(promises.get(DEFAULT_CANVAS_RESOURCE_NAME)!)

  const resources = useMemo(() => {
    const inferred: Record<string, DocumentResource> = {}
    if (ml !== undefined) inferred[DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME] = ml
    if (canvas !== undefined) inferred[DEFAULT_CANVAS_RESOURCE_NAME] = canvas
    return {...inferred, ...explicitResources}
  }, [ml, canvas, explicitResources])

  return <ResourcesContext.Provider value={resources}>{children}</ResourcesContext.Provider>
}

/**
 * When `inferMediaLibraryAndCanvas` is set, this component suspends until
 * inference resolves. The nearest Suspense boundary (e.g. from ResourceProvider)
 * shows its fallback during that window.

 * If a user explicitly names a 'media-library' or 'canvas' resource,
 * this component will use that resource instead of inferring it.
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
