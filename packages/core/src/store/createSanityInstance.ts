import {type SanityConfig} from '../config/sanityConfig'
import {insecureRandomId} from '../utils/ids'
import {createLogger, type InstanceContext} from '../utils/logger'

/**
 * Represents a Sanity.io resource instance with its own configuration and lifecycle.
 *
 * @public
 */
export interface SanityInstance {
  /**
   * Unique identifier for this instance
   * @remarks Generated using crypto.randomUUID()
   */
  readonly instanceId: string

  /** Resolved configuration for this instance */
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
}

/**
 * Creates a new Sanity resource instance
 * @param config - Configuration for the instance (optional)
 * @returns A configured SanityInstance
 *
 * @public
 */
export function createSanityInstance(config: SanityConfig = {}): SanityInstance {
  const instanceId = crypto.randomUUID()
  const disposeListeners = new Map<string, () => void>()
  const disposed = {current: false}

  const instanceContext: InstanceContext = {
    instanceId,
  }

  const logger = createLogger('sdk', {instanceContext})

  logger.info('Sanity instance created', {
    hasAuth: !!config.auth,
    hasPerspective: !!config.perspective,
  })

  logger.debug('Instance configuration', {
    perspective: config.perspective,
    hasStudioConfig: !!config.studio,
    hasStudioTokenSource: !!config.studio?.auth?.token,
    hasAuthProviders: !!config.auth?.providers,
    hasAuthToken: !!config.auth?.token,
  })

  const instance: SanityInstance = {
    instanceId,
    config,
    isDisposed: () => disposed.current,
    dispose: () => {
      if (disposed.current) {
        logger.trace('Dispose called on already disposed instance', {internal: true})
        return
      }
      logger.trace('Disposing instance', {
        internal: true,
        listenerCount: disposeListeners.size,
      })
      disposed.current = true
      disposeListeners.forEach((listener) => listener())
      disposeListeners.clear()
      logger.info('Instance disposed')
    },
    onDispose: (cb) => {
      const listenerId = insecureRandomId()
      disposeListeners.set(listenerId, cb)
      return () => {
        disposeListeners.delete(listenerId)
      }
    },
  }

  return instance
}
