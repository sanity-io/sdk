import {type PerspectiveHandle} from '@sanity/sdk'
import {createContext} from 'react'

/**
 * Provides a perspective override for nested subtrees.
 * Set by `ResourceProvider` so hooks resolve the correct perspective
 * without requiring an explicit `perspective` option.
 * @internal
 */
export const PerspectiveContext = createContext<PerspectiveHandle['perspective'] | undefined>(
  undefined,
)
