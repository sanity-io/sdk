import {type SanityInstance} from '../store/createSanityInstance'
import {createLogger} from '../utils/logger'
import {getTelemetryEnvironment} from './environment'
import {type TelemetryManager} from './telemetryManager'

const DEFAULT_TELEMETRY_API_VERSION = '2024-11-12'

const logger = createLogger('telemetry')

/**
 * Per-instance map of active telemetry managers. Allows the React
 * package (and other consumers) to look up the manager for a given
 * instance and log hook usage / errors without importing the full
 * telemetry module themselves.
 *
 * @internal
 */
const telemetryManagers = new WeakMap<SanityInstance, TelemetryManager>()
const pendingHooks = new WeakMap<SanityInstance, Set<string>>()
const initInFlight = new WeakSet<SanityInstance>()

/**
 * Initializes telemetry for a SDK instance if the runtime environment
 * qualifies. The environment is resolved by `getTelemetryEnvironment()`:
 *
 * - `'development'` — local dev servers (`localhost` / `127.0.0.1`, or
 *   Node with `NODE_ENV=development`). This is the original opt-in
 *   surface.
 * - `'production'` — apps deployed to Sanity-controlled domains
 *   (e.g. `*.sanity.studio`, the dashboard). End users are
 *   authenticated Sanity users with Populus consent records, so we
 *   apply the same consent gate as the Studio's `telemetry-sink`.
 *
 * Apps on customer-controlled domains return `null` and skip telemetry
 * entirely.
 *
 * `telemetryManager` and `clientStore` are dynamically imported so the
 * telemetry code path stays out of production bundles for apps that
 * don't qualify. Only the lightweight environment check runs at boot.
 *
 * The `projectId` must be passed explicitly because the resource
 * configuration is typically set by the React layer after the
 * instance has already been created.
 *
 * @internal
 */
export function initTelemetry(instance: SanityInstance, projectId: string): void {
  const environment = getTelemetryEnvironment()
  if (!environment) {
    logger.trace('initTelemetry skipped: environment not eligible', {internal: true})
    return
  }
  if (!projectId) {
    logger.trace('initTelemetry skipped: no projectId', {internal: true})
    return
  }
  if (telemetryManagers.has(instance) || initInFlight.has(instance)) {
    return
  }
  initInFlight.add(instance)

  logger.debug('initializing telemetry', {projectId, environment})

  Promise.all([
    import('./telemetryManager'),
    import('../client/clientStore'),
    import('../auth/authStore'),
  ])
    .then(async ([{createTelemetryManager}, {getClient}, {getTokenState}]) => {
      if (instance.isDisposed()) {
        initInFlight.delete(instance)
        logger.debug('telemetry skipped: instance disposed before imports resolved')
        return
      }

      // Wait for the auth store to resolve a token. The client needs a
      // Bearer token for the consent check and batch POSTs. If the token
      // is already available (e.g. static token config), this resolves
      // immediately. For OAuth/localStorage discovery it waits for the
      // first emission. For unauthenticated apps the promise never
      // resolves, which is fine since telemetry requires auth anyway.
      const token = getTokenState(instance).getCurrent()
      logger.trace('auth token check', {tokenPresent: !!token, internal: true})

      if (!token) {
        logger.debug('waiting for auth token')
        const hasToken = await new Promise<boolean>((resolve) => {
          if (instance.isDisposed()) return resolve(false)
          const cleanup = {unsubscribe: () => {}}
          const unsub = instance.onDispose(() => {
            cleanup.unsubscribe()
            resolve(false)
          })
          // The token observable is a `shareReplay({bufferSize: 1, refCount: true})`
          // (see `createStateSourceAction`), so it can deliver a buffered value
          // synchronously while we're still inside `.subscribe(cb)`. At that
          // moment `sub` is in the TDZ, so the callback can't reach it. We
          // gate on a `received` flag and let the post-subscribe block do the
          // unsubscribe in the sync-emission case.
          let received = false
          const sub = getTokenState(instance).observable.subscribe((t) => {
            if (received || !t) return
            received = true
            logger.debug('auth token received')
            unsub()
            resolve(true)
            cleanup.unsubscribe()
          })
          cleanup.unsubscribe = () => sub.unsubscribe()
          if (received) cleanup.unsubscribe()
        })
        if (!hasToken || instance.isDisposed()) {
          initInFlight.delete(instance)
          logger.debug('telemetry skipped: no token resolved or instance disposed')
          return
        }
      }

      const manager = createTelemetryManager({
        sessionId: instance.instanceId,
        getClient: () => getClient(instance, {apiVersion: DEFAULT_TELEMETRY_API_VERSION}),
        projectId,
        environment,
      })

      const consented = await manager.checkConsent()
      logger.debug('consent check complete', {consented})
      if (!consented || instance.isDisposed()) {
        initInFlight.delete(instance)
        manager.dispose()
        return
      }

      initInFlight.delete(instance)
      telemetryManagers.set(instance, manager)

      const buffered = pendingHooks.get(instance)
      if (buffered) {
        logger.debug('flushing buffered hooks', {hooks: Array.from(buffered)})
        for (const hookName of buffered) {
          manager.logHookFirstUsed(hookName)
        }
        pendingHooks.delete(instance)
      }

      const config = instance.config
      const perspective = typeof config.perspective === 'string' ? config.perspective : 'published'
      const authMethod = config.auth?.token
        ? 'token'
        : config.studio?.auth?.token
          ? 'studio'
          : 'default'

      logger.info('telemetry session started', {projectId, perspective, authMethod, environment})
      manager.logSessionStarted({
        projectId,
        perspective,
        authMethod,
      })

      instance.onDispose(() => {
        manager.endSession()
        telemetryManagers.delete(instance)
        logger.debug('telemetry session ended')
      })
    })
    .catch((err) => {
      initInFlight.delete(instance)
      logger.warn('telemetry init failed', {error: err})
    })
}

/**
 * Retrieves the telemetry manager for an instance, if one exists.
 * Returns undefined when telemetry is disabled or not yet initialized.
 *
 * @internal
 */
export function getTelemetryManager(instance: SanityInstance): TelemetryManager | undefined {
  return telemetryManagers.get(instance)
}

/**
 * Record a hook name for an instance. If the telemetry manager is
 * already initialized the event is logged immediately. Otherwise
 * the name is buffered and flushed when init completes.
 *
 * @internal
 */
export function trackHookMounted(instance: SanityInstance, hookName: string): void {
  if (!getTelemetryEnvironment()) return

  const manager = findManager(instance)
  if (manager) {
    logger.trace('hook mounted (logged)', {hookName, internal: true})
    manager.logHookFirstUsed(hookName)
    return
  }

  const root = getRootInstance(instance)
  let hooks = pendingHooks.get(root)
  if (!hooks) {
    hooks = new Set()
    pendingHooks.set(root, hooks)
  }
  if (!hooks.has(hookName)) {
    logger.trace('hook mounted (buffered)', {hookName, internal: true})
  }
  hooks.add(hookName)
}

function findManager(instance: SanityInstance): TelemetryManager | undefined {
  return telemetryManagers.get(instance)
}

function getRootInstance(instance: SanityInstance): SanityInstance {
  return instance
}
