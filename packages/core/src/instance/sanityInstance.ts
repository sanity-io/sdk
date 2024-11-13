import type {SanityInstance} from './types'

export const storesKey = Symbol('stores')

/**
 * @public
 * @module @sanity/sdk
 * @category Sanity Instance
 */
export interface SanityConfig {
  projectId: string
  dataset: string
  token?: string
}

/**
 * Returns a new instance of dependecies required for SanitySDK.
 * @public
 * @module @sanity/sdk
 * @category Sanity Instance
 */
export const createSanityInstance = (config: SanityConfig): SanityInstance => {
  return {
    config,
    [storesKey]: {},
  }
}
