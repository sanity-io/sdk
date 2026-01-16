import {type DocumentSource} from '@sanity/sdk'
import {createContext} from 'react'

/** Context for sources.
 * @beta
 */
export const SourcesContext = createContext<Record<string, DocumentSource>>({})
