import {type DocumentResource} from '@sanity/sdk'
import {createContext} from 'react'

/**
 * Provides the active resource for a subtree.
 * Set by `ResourceProvider` so hooks resolve the correct project/dataset
 * without requiring an explicit `resource` option.
 * @internal
 */
export const ResourceContext = createContext<DocumentResource | undefined>(undefined)
