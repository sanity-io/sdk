import {getDefaultDatasetSource, type SanityConfig} from '../config/sanityConfig'
import {insecureRandomId} from '../utils/ids'
import {createLogger, type InstanceContext} from '../utils/logger'

/**
 * Represents a Sanity.io resource instance with its own configuration and lifecycle.
 * @remarks Instances can form a hierarchy through parent/child relationships.
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
}

/**
 * Creates a new Sanity resource instance
 * @param config - Configuration for the instance (optional)
 * @returns A configured SanityInstance
 * @remarks When creating child instances, configurations are merged with parent values.
 *
 * @public
 */
export function createSanityInstance(config: SanityConfig = {}): SanityInstance {
  const instanceId = crypto.randomUUID()
  const disposeListeners = new Map<string, () => void>()
  const disposed = {current: false}
  const defaultSource = getDefaultDatasetSource(config)

  const instanceContext: InstanceContext = {
    instanceId,
    projectId: defaultSource?.projectId,
    dataset: defaultSource?.dataset,
  }

  const logger = createLogger('sdk', {instanceContext})

  logger.info('Sanity instance created', {
    hasProjectId: !!defaultSource?.projectId,
    hasDefaultSource: !!config.defaultSource,
    hasAuth: !!config.auth,
    hasPerspective: !!config.perspective,
  })

  logger.debug('Instance configuration', {
    projectId: defaultSource?.projectId,
    dataset: defaultSource?.dataset,
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
    getParent: () => undefined,
    createChild: (next) => {
      logger.debug('Creating child instance', {
        parentInstanceId: instanceId.slice(0, 8),
        overridingDefaultSource: !!next.defaultSource,
        overridingAuth: !!next.auth,
      })
      const child = Object.assign(
        createSanityInstance({
          ...config,
          ...next,
          ...(config.auth === next.auth
            ? config.auth
            : config.auth && next.auth && {auth: {...config.auth, ...next.auth}}),
        }),
        {getParent: () => instance},
      )
      logger.trace('Child instance created', {
        internal: true,
        childInstanceId: child.instanceId.slice(0, 8),
      })
      return child
    },
  }

  return instance
}
