import {pick} from 'lodash-es'

import {type SanityConfig} from '../config/sanityConfig'
import {insecureRandomId} from '../utils/ids'

/**
 * Represents a Sanity.io resource instance with its own configuration and lifecycle
 * @remarks Instances form a hierarchy through parent/child relationships
 *
 * @public
 */
export interface SanityInstance {
  /**
   * Unique identifier for this instance
   * @remarks Generated using crypto.randomUUID()
   */
  readonly instanceId: string

  /**
   * Resolved configuration for this instance
   * @remarks Merges values from parent instances where appropriate
   */
  readonly config: SanityConfig

  /**
   * Checks if the instance has been disposed
   * @returns true if dispose() has been called
   */
  isDisposed(): boolean

  /**
   * Disposes the instance and cleans up associated resources
   * @remarks Triggers all registered onDispose callbacks
   */
  dispose(): void

  /**
   * Registers a callback to be invoked when the instance is disposed
   * @param cb - Callback to execute on disposal
   * @returns Function to unsubscribe the callback
   */
  onDispose(cb: () => void): () => void

  /**
   * Gets the parent instance in the hierarchy
   * @returns Parent instance or undefined if this is the root
   */
  getParent(): SanityInstance | undefined

  /**
   * Creates a child instance with merged configuration
   * @param config - Configuration to merge with parent values
   * @remarks Child instances inherit parent configuration but can override values
   */
  createChild(config: SanityConfig): SanityInstance

  /**
   * Traverses the instance hierarchy to find the first instance whose configuration
   * matches the given target config using a shallow comparison.
   * @param targetConfig - A partial configuration object containing key-value pairs to match.
   * @returns The first matching instance or undefined if no match is found.
   */
  match(targetConfig: Partial<SanityConfig>): SanityInstance | undefined
}

/**
 * Creates a new Sanity resource instance
 * @param config - Configuration for the instance (optional)
 * @returns A configured SanityInstance
 * @remarks When creating child instances, configurations are merged with parent values
 *
 * @public
 */
export function createSanityInstance(config: SanityConfig = {}): SanityInstance {
  const instanceId = crypto.randomUUID()
  const disposeListeners = new Map<string, () => void>()
  const disposed = {current: false}

  const instance: SanityInstance = {
    instanceId,
    config,
    isDisposed: () => disposed.current,
    dispose: () => {
      if (disposed.current) return
      disposed.current = true
      disposeListeners.forEach((listener) => listener())
      disposeListeners.clear()
    },
    onDispose: (cb) => {
      const listenerId = insecureRandomId()
      disposeListeners.set(listenerId, cb)
      return () => {
        disposeListeners.delete(listenerId)
      }
    },
    getParent: () => undefined,
    createChild: (next) =>
      Object.assign(
        createSanityInstance({
          ...config,
          ...next,
          ...(config.auth === next.auth
            ? config.auth
            : config.auth && next.auth && {auth: {...config.auth, ...next.auth}}),
        }),
        {getParent: () => instance},
      ),
    match: (targetConfig) => {
      if (
        Object.entries(pick(targetConfig, 'auth', 'projectId', 'dataset')).every(
          ([key, value]) => config[key as keyof SanityConfig] === value,
        )
      ) {
        return instance
      }

      const parent = instance.getParent()
      if (parent) return parent.match(targetConfig)
      return undefined
    },
  }

  return instance
}
