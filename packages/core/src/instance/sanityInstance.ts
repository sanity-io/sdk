import {disposeResources} from '../resources/createResource'
import {getSdkIdentity} from './identity'
import {type SanityConfig, type SanityInstance, type SdkIdentity} from './types'

/**
 * Returns a new instance of dependencies required for SanitySDK.
 *
 * @public
 *
 * @param config - The configuration for this instance
 *
 * @returns A new "instance" of a Sanity SDK, used to bind resources/configuration to it
 */
export function createSanityInstance({
  projectId = '',
  dataset = '',
  ...config
}: SanityConfig): SanityInstance {
  const identity = getSdkIdentity({projectId, dataset})
  return {
    identity,
    config,
    dispose: () => disposeResources(identity),
  }
}

const resourceStorage = new WeakMap<SdkIdentity, Map<string, unknown>>()

function getResource(instance: SanityInstance, key: string) {
  const instanceMap = resourceStorage.get(instance.identity)
  return instanceMap?.get(key)
}

function setResource(instance: SanityInstance, key: string, value: unknown) {
  let instanceMap = resourceStorage.get(instance.identity)
  if (!instanceMap) {
    instanceMap = new Map()
    resourceStorage.set(instance.identity, instanceMap)
  }
  instanceMap.set(key, value)
}

/**
 * This is an internal function that retrieves or creates a Zustand store resource.
 * @internal
 */
export function getOrCreateResource<T>(instance: SanityInstance, key: string, creator: () => T): T {
  const cached = getResource(instance, key)

  if (cached) {
    return cached as T
  }

  const resource = creator()
  setResource(instance, key, resource)
  return resource
}
