import {getSdkIdentity} from './identity'
import type {SanityInstance, SdkIdentity} from './types'

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
 * Returns a new instance of dependencies required for SanitySDK.
 *
 * @param config - The configuration for this instance
 * @returns A new "instance" of a Sanity SDK, used to bind resources/configuration to it
 * @public
 * @module @sanity/sdk
 * @category Sanity Instance
 */
export function createSanityInstance(config?: SanityConfig): SanityInstance {
  const {projectId = '', dataset = '', token} = config ?? {}
  return {
    identity: getSdkIdentity({projectId, dataset}),
    config: {token},
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

export function getOrCreateResource<T>(instance: SanityInstance, key: string, creator: () => T): T {
  const cached = getResource(instance, key)
  if (cached) return cached as T

  const resource = creator()
  setResource(instance, key, resource)
  return resource
}
