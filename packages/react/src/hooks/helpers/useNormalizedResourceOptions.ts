import {type DocumentResource, type PerspectiveHandle} from '@sanity/sdk'
import {useContext, useMemo} from 'react'

import {ResourceContext} from '../../context/DefaultResourceContext'
import {PerspectiveContext} from '../../context/PerspectiveContext'
import {ResourcesContext} from '../../context/ResourcesContext'
import {SanityInstanceContext} from '../../context/SanityInstanceContext'

type NormalizedResourceFields = 'resourceName' | 'source' | 'sourceName' | 'projectId' | 'dataset'

/**
 * Adds React hook support (resourceName resolution) to core types.
 * Prefer using the React-layer handle types (ResourceHandle, DocumentHandle)
 * from `@sanity/sdk-react` — this wrapper is kept for cases where overloads
 * don't fit (e.g. non-handle options objects).
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
 * @param contextResource - Resource from context (from ResourceContext)
 * @param contextPerspective - Perspective from context (from PerspectiveContext)
 * @returns Normalized options with `resourceName` removed and `resource` resolved
 * @internal
 */
export function normalizeResourceOptions<
  T extends {
    resource?: DocumentResource
    resourceName?: string
    source?: DocumentResource
    sourceName?: string
    projectId?: string
    dataset?: string
    perspective?: unknown
  },
>(
  options: T,
  resources: Record<string, DocumentResource>,
  contextResource?: DocumentResource,
  contextPerspective?: PerspectiveHandle['perspective'],
): Omit<T, NormalizedResourceFields> {
  const {resourceName, sourceName, source, projectId, dataset, ...rest} = options

  // Coalesce deprecated aliases to their canonical equivalents
  const effectiveResourceName = resourceName ?? sourceName
  const effectiveResource = options.resource ?? source

  if (effectiveResourceName && effectiveResource) {
    throw new Error(
      `Resource name ${JSON.stringify(effectiveResourceName)} and resource ${JSON.stringify(effectiveResource)} cannot be used together.`,
    )
  }

  let resolvedResource: DocumentResource | undefined

  // Tier (a): explicit resource object or resourceName lookup
  if (effectiveResource) {
    resolvedResource = effectiveResource
  } else if (effectiveResourceName) {
    if (!Object.hasOwn(resources, effectiveResourceName)) {
      throw new Error(
        `There's no resource named ${JSON.stringify(effectiveResourceName)} in context. Please use <ResourceProvider>.`,
      )
    }
    resolvedResource = resources[effectiveResourceName]
  }

  // Tier (b): projectId or dataset in options → synthesize a resource
  if (!resolvedResource && projectId && dataset) {
    resolvedResource = {
      projectId,
      dataset,
    }
  }

  // Tier (c): fall back to whatever ResourceContext provides
  if (!resolvedResource) {
    resolvedResource = contextResource
  }

  // Inject perspective from context when not explicitly provided in options
  const resolvedPerspective = Object.hasOwn(options, 'perspective')
    ? options.perspective
    : contextPerspective

  return {
    ...rest,
    ...(resolvedResource !== undefined && {resource: resolvedResource}),
    ...(resolvedPerspective !== undefined && {perspective: resolvedPerspective}),
  }
}

/**
 * Returns the effective context resource: the `ResourceContext` value if set,
 * otherwise a resource synthesized from the current `SanityInstance` config
 * (tier-d fallback — returns `undefined` for studio-style configs with no project).
 *
 * @internal
 */
export function useEffectiveContextResource(): DocumentResource | undefined {
  const contextResource = useContext(ResourceContext)
  const instance = useContext(SanityInstanceContext)
  const {projectId, dataset} = instance?.config ?? {}

  return useMemo(() => {
    if (contextResource) return contextResource
    if (projectId && dataset) return {projectId, dataset}
    return undefined
  }, [contextResource, projectId, dataset])
}

/**
 * Normalizes hook options by resolving `resourceName` to a `DocumentResource`.
 *
 * Resolution priority for resource:
 * 1. Explicit `resource` or `resourceName` in options
 * 2. Bare `projectId`/`dataset` pair in options → synthesized into a resource
 * 3. `ResourceContext` value (set by `ResourceProvider` / `SDKProvider`)
 * 4. Current `SanityInstance` config — falls back to `undefined` for studio configs
 *
 * Resolution priority for perspective:
 * 1. Explicit `perspective` in options
 * 2. `PerspectiveContext` value (set by `ResourceProvider`)
 *
 * @internal
 */
export function useNormalizedResourceOptions<
  T extends {
    resource?: DocumentResource
    resourceName?: string
    source?: DocumentResource
    sourceName?: string
    projectId?: string
    dataset?: string
    perspective?: unknown
  },
>(options: T): Omit<T, NormalizedResourceFields> {
  const resources = useContext(ResourcesContext)
  const effectiveContextResource = useEffectiveContextResource()
  const contextPerspective = useContext(PerspectiveContext)

  return normalizeResourceOptions(options, resources, effectiveContextResource, contextPerspective)
}
