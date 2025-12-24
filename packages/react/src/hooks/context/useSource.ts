import {type DocumentSource} from '@sanity/sdk'
import {useContext} from 'react'

import {SourcesContext} from '../../context/SourcesContext'

/** Retrives the named source from context. */
export function useSource(name: string): DocumentSource {
  const sources = useContext(SourcesContext)

  if (!Object.hasOwn(sources, name)) {
    throw new Error(
      `There's no source named ${JSON.stringify(name)} in context. Please use <SourceProvider>.`,
    )
  }

  return sources[name]
}
