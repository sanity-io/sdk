import {type DocumentResource, type PerspectiveHandle} from '@sanity/sdk'
import {useContext} from 'react'

import {ResourceContext} from '../../context/DefaultResourceContext'
import {PerspectiveContext} from '../../context/PerspectiveContext'
import {ResourcesContext} from '../../context/ResourcesContext'

/**
 * Adds React hook support (resourceName resolution) to core types.
 * This wrapper allows hooks to accept `resourceName` as a convenience,
 * which is then resolved to a `DocumentResource` at the React layer.
 * For now, we are trying to avoid resource name resolution in core --
 * functions having resources explicitly passed will reduce complexity.
 *
 * @beta
 */
export type WithResourceNameSupport<T> = Omit<T, 'resource'> & {
  resource?: DocumentResource
  /**
   * Optional name of a resource to resolve from context.
   * If provided, will be resolved to a `DocumentResource` via `ResourcesContext`.
   * @beta
   */
  resourceName?: string
}

/**
 * Pure function that normalizes options by resolving `resourceName` to a `DocumentResource`
 * using the provided resources map, and injecting defaults from context when not provided.
 * Use this when options are only available at call time (e.g. inside a callback)
 * and you cannot call the {@link useNormalizedResourceOptions} hook.
 *
 * @typeParam T - The options type (must include optional resource field)
 * @param options - Options that may include `resourceName` and/or `resource`
 * @param resources - Map of resource names to DocumentResource (e.g. from ResourcesContext)
 * @param contextResource - Resource from context (injected by ResourceProvider)
 * @param contextPerspective - Perspective from context (injected by ResourceProvider)
 * @returns Normalized options with `resourceName` removed and defaults injected
 * @internal
 */
export function normalizeResourceOptions<
  T extends {
    resource?: DocumentResource
    resourceName?: string
    perspective?: unknown
    projectId?: string
    dataset?: string
    mediaLibraryId?: string
    canvasId?: string
  },
>(
  options: T,
  resources: Record<string, DocumentResource>,
  contextResource?: DocumentResource,
  contextPerspective?: PerspectiveHandle['perspective'],
): Omit<T, 'resourceName' | 'resource'> & {resource: DocumentResource} {
  const {resourceName, projectId, dataset, mediaLibraryId, canvasId, ...rest} = options

  if (resourceName && Object.hasOwn(options, 'resource')) {
    throw new Error(
      `Resource name ${JSON.stringify(resourceName)} and resource ${JSON.stringify(options.resource)} cannot be used together.`,
    )
  }

  let resolvedResource: DocumentResource | undefined = options.resource

  if (!resolvedResource && resourceName) {
    if (!Object.hasOwn(resources, resourceName)) {
      throw new Error(
        `There's no resource named ${JSON.stringify(resourceName)} in context. ` +
          'Register it via the resources prop on <SanityApp>.',
      )
    }
    resolvedResource = resources[resourceName]
  }

  const hasProjectId = projectId !== undefined
  const hasDataset = dataset !== undefined
  if (!resolvedResource && (hasProjectId || hasDataset) && !(hasProjectId && hasDataset)) {
    throw new Error(
      'projectId and dataset must be provided together when targeting a dataset resource.',
    )
  }

  if (!resolvedResource && projectId && dataset) {
    resolvedResource = {projectId, dataset}
  } else if (!resolvedResource && mediaLibraryId) {
    resolvedResource = {mediaLibraryId}
  } else if (!resolvedResource && canvasId) {
    resolvedResource = {canvasId}
  }

  const hasExplicitTargeting =
    projectId !== undefined ||
    dataset !== undefined ||
    mediaLibraryId !== undefined ||
    canvasId !== undefined
  if (!resolvedResource && !hasExplicitTargeting) {
    resolvedResource = contextResource
  }

  if (resolvedResource === undefined) {
    throw new Error(
      'A resource is required. Provide `resource`, `resourceName`, or ensure a default resource is available from context (e.g. via <ResourceProvider> or <SanityApp>).',
    )
  }

  const resolvedPerspective = Object.hasOwn(options, 'perspective')
    ? options.perspective
    : contextPerspective

  return {
    ...rest,
    resource: resolvedResource,
    ...(resolvedPerspective !== undefined && {perspective: resolvedPerspective}),
  } as Omit<T, 'resourceName' | 'resource'> & {resource: DocumentResource}
}

/**
 * Normalizes hook options by resolving `resourceName` to a `DocumentResource`
 * and injecting resource/perspective from context.
 *
 * This hook ensures that options passed to core layer functions contain
 * the correct `resource` and `perspective` values, maintaining clean
 * separation between React and core layers.
 *
 * @typeParam T - The options type (must include optional resource field)
 * @param options - Hook options that may include `resourceName` and/or `resource`
 * @returns Normalized options with `resourceName` removed and defaults injected
 *
 * @remarks
 * Resolution priority for resource:
 * 1. If both `resourceName` and `resource` are provided, throws an error
 * 2. If `resource` is provided, uses it directly
 * 3. If `resourceName` is provided, resolves it via `ResourcesContext`
 * 4. If neither is provided, injects the value from `ResourceContext`
 *
 * Resolution priority for perspective:
 * 1. If `perspective` is explicitly provided in options, uses it
 * 2. Otherwise, injects the value from `PerspectiveContext`
 *
 * @example
 * ```tsx
 * function useQuery(options: WithResourceNameSupport<QueryOptions>) {
 *   const instance = useSanityInstance()
 *   const normalized = useNormalizedResourceOptions(options)
 *   // normalized has resource and perspective resolved from context
 *   const queryKey = getQueryKey(normalized)
 * }
 * ```
 *
 * @beta
 */
export function useNormalizedResourceOptions<
  T extends {
    resource?: DocumentResource
    resourceName?: string
    perspective?: unknown
    projectId?: string
    dataset?: string
    mediaLibraryId?: string
    canvasId?: string
  },
>(options: T): Omit<T, 'resourceName' | 'resource'> & {resource: DocumentResource} {
  const resources = useContext(ResourcesContext)
  const contextResource = useContext(ResourceContext)
  const contextPerspective = useContext(PerspectiveContext)
  return normalizeResourceOptions(options, resources, contextResource, contextPerspective)
}
