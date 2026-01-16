import {type DocumentSource} from '@sanity/sdk'
import {useContext} from 'react'

import {SourcesContext} from '../../context/SourcesContext'

/** Retrives the named source from context.
 * @beta
 * @param name - The name of the source to retrieve.
 * @returns The source.
 * @example
 * ```tsx
 * const source = useSource('my-source')
 * ```
 */
export function useSource(name: string | undefined): DocumentSource | undefined {
  const sources = useContext(SourcesContext)

  // this might return the "default" source in the future once we implement it?
  if (!name) {
    return undefined
  }

  if (!Object.hasOwn(sources, name)) {
    throw new Error(
      `There's no source named ${JSON.stringify(name)} in context. Please use <SourceProvider>.`,
    )
  }

  return sources[name]
}
