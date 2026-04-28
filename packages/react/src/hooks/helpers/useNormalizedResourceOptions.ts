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
  /**
   * @deprecated Use `resourceName` instead.
   * @beta
   */
  sourceName?: string
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
  T extends {
    resource?: DocumentResource
    resourceName?: string
    source?: DocumentResource
    sourceName?: string
  },
>(
  options: T,
  resources: Record<string, DocumentResource>,
): Omit<T, 'resourceName' | 'source' | 'sourceName'> {
  const {resourceName, sourceName, source, ...rest} = options

  // Coalesce deprecated aliases to their canonical equivalents
  const effectiveResourceName = resourceName ?? sourceName
  const effectiveResource = options.resource ?? source

  if (!effectiveResourceName && !effectiveResource) {
    return rest as Omit<T, 'resourceName' | 'source' | 'sourceName'>
  }

  const hasNameKey = Object.hasOwn(options, 'resourceName') || Object.hasOwn(options, 'sourceName')
  const hasResourceKey = Object.hasOwn(options, 'resource') || Object.hasOwn(options, 'source')

  if (hasNameKey && hasResourceKey) {
    throw new Error(
      `Resource name ${JSON.stringify(effectiveResourceName)} and resource ${JSON.stringify(effectiveResource)} cannot be used together.`,
    )
  }

  let resolvedResource: DocumentResource | undefined

  if (effectiveResource) {
    resolvedResource = effectiveResource
  }

  if (effectiveResourceName && !Object.hasOwn(resources, effectiveResourceName)) {
    throw new Error(
      `There's no resource named ${JSON.stringify(effectiveResourceName)} in context. Please use <ResourceProvider>.`,
    )
  }

  if (effectiveResourceName && resources[effectiveResourceName]) {
    resolvedResource = resources[effectiveResourceName]
  }

  return {
    ...rest,
    resource: resolvedResource,
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
 * 1. If `resourceName` is provided, resolves it via `ResourcesContext` and uses that
 * 2. Otherwise, uses the inline `resource` if provided
 * 3. If neither is provided, returns options without a resource field
 *
 * @example
 * ```tsx
 * function useQuery(options: WithResourceNameSupport<QueryOptions>) {
 *   const instance = useSanityInstance(options)
 *   const normalized = useNormalizedOptions(options)
 *   // normalized now has resource but never resourceName
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
    source?: DocumentResource
    sourceName?: string
  },
>(options: T): Omit<T, 'resourceName' | 'source' | 'sourceName'> {
  const resources = useContext(ResourcesContext)
  return normalizeResourceOptions(options, resources)
}
