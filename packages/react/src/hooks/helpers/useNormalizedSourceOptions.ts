import {type DocumentSource} from '@sanity/sdk'
import {useContext} from 'react'

import {SourcesContext} from '../../context/SourcesContext'

/**
 * Adds React hook support (sourceName resolution) to core types.
 * This wrapper allows hooks to accept `sourceName` as a convenience,
 * which is then resolved to a `DocumentSource` at the React layer.
 * For now, we are trying to avoid source name resolution in core --
 * functions having sources explicitly passed will reduce complexity.
 *
 * @typeParam T - The core type to extend (must have optional `source` field)
 * @beta
 */
export type WithSourceNameSupport<T extends {source?: DocumentSource}> = T & {
  /**
   * Optional name of a source to resolve from context.
   * If provided, will be resolved to a `DocumentSource` via `SourcesContext`.
   * @beta
   */
  sourceName?: string
}

/**
 * Pure function that normalizes options by resolving `sourceName` to a `DocumentSource`
 * using the provided sources map. Use this when options are only available at call time
 * (e.g. inside a callback) and you cannot call the {@link useNormalizedSourceOptions} hook.
 *
 * @typeParam T - The options type (must include optional source field)
 * @param options - Options that may include `sourceName` and/or `source`
 * @param sources - Map of source names to DocumentSource (e.g. from SourcesContext)
 * @returns Normalized options with `sourceName` removed and `source` resolved
 * @internal
 */
export function normalizeSourceOptions<T extends {source?: DocumentSource; sourceName?: string}>(
  options: T,
  sources: Record<string, DocumentSource>,
): Omit<T, 'sourceName'> {
  const {sourceName, ...rest} = options

  if (!sourceName && !options.source) {
    return options
  }

  if (sourceName && Object.hasOwn(options, 'source')) {
    throw new Error(
      `Source name ${JSON.stringify(sourceName)} and source ${JSON.stringify(options.source)} cannot be used together.`,
    )
  }

  let resolvedSource: DocumentSource | undefined

  if (options.source) {
    resolvedSource = options.source
  }

  if (sourceName && !Object.hasOwn(sources, sourceName)) {
    throw new Error(
      `There's no source named ${JSON.stringify(sourceName)} in context. Please use <SourceProvider>.`,
    )
  }

  if (sourceName && sources[sourceName]) {
    resolvedSource = sources[sourceName]
  }

  return {
    ...rest,
    source: resolvedSource,
  }
}

/**
 * Normalizes hook options by resolving `sourceName` to a `DocumentSource`.
 * This hook ensures that options passed to core layer functions only contain
 * `source` (never `sourceName`), preventing duplicate cache keys and maintaining
 * clean separation between React and core layers.
 *
 * @typeParam T - The options type (must include optional source field)
 * @param options - Hook options that may include `sourceName` and/or `source`
 * @returns Normalized options with `sourceName` removed and `source` resolved
 *
 * @remarks
 * Resolution priority:
 * 1. If `sourceName` is provided, resolves it via `SourcesContext` and uses that
 * 2. Otherwise, uses the inline `source` if provided
 * 3. If neither is provided, returns options without a source field
 *
 * @example
 * ```tsx
 * function useQuery(options: WithSourceNameSupport<QueryOptions>) {
 *   const instance = useSanityInstance(options)
 *   const normalized = useNormalizedOptions(options)
 *   // normalized now has source but never sourceName
 *   const queryKey = getQueryKey(normalized)
 * }
 * ```
 *
 * @beta
 */
export function useNormalizedSourceOptions<
  T extends {source?: DocumentSource; sourceName?: string},
>(options: T): Omit<T, 'sourceName'> {
  const sources = useContext(SourcesContext)
  return normalizeSourceOptions(options, sources)
}
