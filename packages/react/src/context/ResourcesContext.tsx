import {type DocumentResource} from '@sanity/sdk'
import {createContext} from 'react'

/** Context for resources.
 * @beta
 */
export const ResourcesContext = createContext<Record<string, DocumentResource>>({})
