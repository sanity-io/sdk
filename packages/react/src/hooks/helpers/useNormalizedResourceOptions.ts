import {type DocumentResource, type PerspectiveHandle} from '@sanity/sdk'
import {use, useContext} from 'react'

import {ResourceContext} from '../../context/DefaultResourceContext'
import {
  DEFAULT_CANVAS_RESOURCE_NAME,
  DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME,
  OrgInferenceContext,
} from '../../context/OrgInferenceContext'
import {PerspectiveContext} from '../../context/PerspectiveContext'
import {ResourcesContext} from '../../context/ResourcesContext'

/** The resource names that can be populated by org inference. When a hook
 * requests one of these by name and it isn't in the map yet, we suspend
 * until inference settles rather than throwing a "resource not found" error.
 */
const INFERRED_RESOURCE_NAMES = new Set([
  DEFAULT_CANVAS_RESOURCE_NAME,
  DEFAULT_MEDIA_LIBRARY_RESOURCE_NAME,
])

/**
 * You should generally prefer to use the React-layer handle types (ResourceHandle, DocumentHandle) from '\@sanity/sdk-react' instead.
 * This type is useful for non-handles (like document actions) that we still want to resolve resources for.
 * Adds React hook support (resourceName resolution) to core types.
 * @internal
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
  },
>(
  options: T,
  resources: Record<string, DocumentResource>,
  contextResource?: DocumentResource,
  contextPerspective?: PerspectiveHandle['perspective'],
): Omit<T, 'resourceName' | 'resource'> & {resource: DocumentResource} {
  const {resourceName, ...rest} = options

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

  if (!resolvedResource) {
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
 * @internal
 */
export function useNormalizedResourceOptions<
  T extends {
    resource?: DocumentResource
    resourceName?: string
    perspective?: unknown
  },
>(options: T): Omit<T, 'resourceName' | 'resource'> & {resource: DocumentResource} {
  const resources = useContext(ResourcesContext)
  const contextResource = useContext(ResourceContext)
  const contextPerspective = useContext(PerspectiveContext)
  const inferencePromise = useContext(OrgInferenceContext)

  // If a named resource isn't in the map yet but is one of the names that
  // org inference populates, suspend just this hook's component until the
  // inference promise settles. The resolved map is used directly so there's
  // no race between the promise resolving and a context update propagating.
  if (
    inferencePromise !== null &&
    options.resourceName !== undefined &&
    INFERRED_RESOURCE_NAMES.has(options.resourceName) &&
    !Object.hasOwn(resources, options.resourceName)
  ) {
    const inferredResources = use(inferencePromise)
    return normalizeResourceOptions(
      options,
      // if user has manually provided a "media-library" or "canvas" resource, use that instead of the inferred one
      {...inferredResources, ...resources},
      contextResource,
      contextPerspective,
    )
  }

  return normalizeResourceOptions(options, resources, contextResource, contextPerspective)
}
