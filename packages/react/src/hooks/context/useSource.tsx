import {type DatasetHandle, type DocumentHandle, type DocumentSource} from '@sanity/sdk'
import {useContext} from 'react'

import {SourcesContext} from '../../context/SourcesContext'

/** Retrieves the named source from context.
 * @beta
 * @param name - The name of the source to retrieve.
 * @returns The source.
 * @example
 * ```tsx
 * const source = useSource('my-source')
 * ```
 */
export function useSource(options: DocumentHandle | DatasetHandle): DocumentSource | undefined {
  const sources = useContext(SourcesContext)

  // this might return the "default" source in the future once we implement it?
  if (!options.sourceName && !options.source) {
    return undefined
  }

  if (options.source) {
    return options.source
  }

  if (options.sourceName && !Object.hasOwn(sources, options.sourceName)) {
    throw new Error(
      `There's no source named ${JSON.stringify(options.sourceName)} in context. Please use <SourceProvider>.`,
    )
  }

  return options.sourceName ? sources[options.sourceName] : undefined
}
