import {disposeResources} from '../resources/createResource'
import {getSdkResources} from './identity'
import {type SanityConfig, type SanityInstance, type SdkResource} from './types'

/**
 * Returns a new instance of dependencies required for SanitySDK.
 *
 * @public
 *
 * @param config - The configuration for this instance
 *
 * @returns A new "instance" of a Sanity SDK, used to bind resources/configuration to it
 */
export function createSanityInstance({resources, ...config}: SanityConfig): SanityInstance {
  const _resources = getSdkResources(resources) as SdkResource[]
  return {
    resources: _resources,
    config,
    dispose: () => disposeResources(_resources),
  }
}
