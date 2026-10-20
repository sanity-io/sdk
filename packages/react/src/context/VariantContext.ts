import {createContext} from 'react'

/**
 * Provides the active variant for a subtree.
 * Set by ResourceProvider; injected by useNormalizedResourceOptions when
 * the hook's options don't include an explicit variant.
 * @internal
 */
export const VariantContext = createContext<string | undefined>(undefined)
