import {type DocumentResource} from '@sanity/sdk'
import {createContext} from 'react'

/**
 * Provides the active DocumentResource for a subtree.
 * Set by ResourceProvider; read by useNormalizedResourceOptions as a fallback
 * when hooks receive no explicit resource or resourceName.
 * @internal
 */
export const ResourceContext = createContext<DocumentResource | undefined>(undefined)
