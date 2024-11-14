import type {SanityInstance} from './types'

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
 * @public
 * @module @sanity/sdk
 * @category Sanity Instance
 */
export const createSanityInstance = (config: SanityConfig): SanityInstance => {
  const randomId = Array.from({length: 8}, () =>
    Math.floor(Math.random() * 16)
      .toString(16)
      .padStart(2, '0'),
  ).join('')

  return {
    config,
    instanceId: Symbol(['SanityInstance', randomId].join('.')) as SanityInstance['instanceId'],
  }
}

// TODO: we may want to implement a similar mechanism to
// https://github.com/sanity-io/sanity/pull/7160
// because this storage mechanism requires this singleton be the same across
// various imports of the SDK
// NOTE: this was intended to be a weakmap but symbols cannot be used in those
const resourceStorage = new Map<symbol, Map<string, unknown>>()

function getResource(instance: SanityInstance, key: string) {
  const instanceMap = resourceStorage.get(instance.instanceId)
  return instanceMap?.get(key)
}

function setResource(instance: SanityInstance, key: string, value: unknown) {
  let instanceMap = resourceStorage.get(instance.instanceId)
  if (!instanceMap) {
    instanceMap = new Map()
    resourceStorage.set(instance.instanceId, instanceMap)
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
