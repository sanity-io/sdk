import {type PerspectiveHandle} from '@sanity/sdk'
import {createContext} from 'react'

/**
 * Provides the active perspective for a subtree.
 * Set by ResourceProvider; injected by useNormalizedResourceOptions when
 * the hook's options don't include an explicit perspective.
 * @internal
 */
export const PerspectiveContext = createContext<PerspectiveHandle['perspective'] | undefined>(
  undefined,
)
