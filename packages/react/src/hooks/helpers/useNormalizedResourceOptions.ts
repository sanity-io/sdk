import {type DocumentResource} from '@sanity/sdk'
import {useContext} from 'react'

import {ResourcesContext} from '../../context/ResourcesContext'

/**
 * Adds React hook support (resourceName resolution) to core types.
 * This wrapper allows hooks to accept `resourceName` as a convenience,
 * which is then resolved to a `DocumentResource` at the React layer.
 * For now, we are trying to avoid resource name resolution in core --
 * functions having resources explicitly passed will reduce complexity.
 *
 * @typeParam T - The core type to extend (must have optional `resource` field)
 * @beta
 */
export type WithResourceNameSupport<T extends {resource?: DocumentResource}> = T & {
  /**
   * Optional name of a resource to resolve from context.
   * If provided, will be resolved to a `DocumentResource` via `ResourcesContext`.
   * @beta
   */
  resourceName?: string
}

/**
 * Pure function that normalizes options by resolving `resourceName` to a `DocumentResource`
 * using the provided resources map. Use this when options are only available at call time
 * (e.g. inside a callback) and you cannot call the {@link useNormalizedResourceOptions} hook.
 *
 * @typeParam T - The options type (must include optional resource field)
 * @param options - Options that may include `resourceName` and/or `resource`
 * @param resources - Map of resource names to DocumentResource (e.g. from ResourcesContext)
 * @returns Normalized options with `resourceName` removed and `resource` resolved
 * @internal
 */
export function normalizeResourceOptions<
  T extends {resource?: DocumentResource; resourceName?: string},
>(options: T, resources: Record<string, DocumentResource>): Omit<T, 'resourceName'> {
  const {resourceName, ...rest} = options

  if (resourceName && Object.hasOwn(options, 'resource')) {
    throw new Error(
      `Resource name ${JSON.stringify(resourceName)} and resource ${JSON.stringify(options.resource)} cannot be used together.`,
    )
  }

  if (options.resource) {
    return {...rest, resource: options.resource}
  }

  // Only resolve from ResourcesContext when resourceName is explicitly provided.
  // When neither resource nor resourceName is given, let the core layer fall back
  // to resolveDefaultResource(instance.config) so nested ResourceProviders
  // target the correct project/dataset.
  if (!resourceName) {
    return rest as Omit<T, 'resourceName'>
  }

  if (!Object.hasOwn(resources, resourceName)) {
    throw new Error(
      `There's no resource named ${JSON.stringify(resourceName)} in context. ` +
        'Register it via the resources prop on <SanityApp>.',
    )
  }

  return {
    ...rest,
    resource: resources[resourceName],
  }
}

/**
 * Normalizes hook options by resolving `resourceName` to a `DocumentResource`.
 * This hook ensures that options passed to core layer functions only contain
 * `resource` (never `resourceName`), preventing duplicate cache keys and maintaining
 * clean separation between React and core layers.
 *
 * @typeParam T - The options type (must include optional resource field)
 * @param options - Hook options that may include `resourceName` and/or `resource`
 * @returns Normalized options with `resourceName` removed and `resource` resolved
 *
 * @remarks
 * Resolution priority:
 * 1. If both `resourceName` and `resource` are provided, throws an error
 * 2. If `resource` is provided, uses it directly
 * 3. If `resourceName` is provided, resolves it via `ResourcesContext`
 * 4. If neither is provided, returns options as-is (the core layer falls back
 *    to `resolveDefaultResource(instance.config)`, which respects nested `ResourceProvider`s)
 *
 * @example
 * ```tsx
 * function useQuery(options: WithResourceNameSupport<QueryOptions>) {
 *   const instance = useSanityInstance()
 *   const normalized = useNormalizedOptions(options)
 *   // normalized now has resource but never resourceName
 *   const queryKey = getQueryKey(normalized)
 * }
 * ```
 *
 * @beta
 */
export function useNormalizedResourceOptions<
  T extends {resource?: DocumentResource; resourceName?: string},
>(options: T): Omit<T, 'resourceName'> {
  const resources = useContext(ResourcesContext)
  return normalizeResourceOptions(options, resources)
}
