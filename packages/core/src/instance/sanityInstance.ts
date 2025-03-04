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
export function createSanityInstance({
  resources = [{projectId: '', dataset: ''}],
  ...config
}: SanityConfig): SanityInstance {
  const _resources = getSdkResources(resources) as SdkResource[]
  return {
    resources: _resources,
    config,
    dispose: () => disposeResources(_resources),
  }
}

const resourceStorage = new WeakMap<SanityInstance, Map<string, unknown>>()

function getResource(instance: SanityInstance, key: string) {
  const instanceMap = resourceStorage.get(instance)
  return instanceMap?.get(key)
}

function setResource(instance: SanityInstance, key: string, value: unknown) {
  let instanceMap = resourceStorage.get(instance)
  if (!instanceMap) {
    instanceMap = new Map()
    resourceStorage.set(instance, instanceMap)
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
