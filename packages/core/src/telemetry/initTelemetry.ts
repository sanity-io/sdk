import {type SanityInstance} from '../store/createSanityInstance'
import {isDevMode} from './devMode'
import {type TelemetryManager} from './telemetryManager'

const DEFAULT_TELEMETRY_API_VERSION = '2024-11-12'

/**
 * Per-instance map of active telemetry managers. Allows the React
 * package (and other consumers) to look up the manager for a given
 * instance and log hook usage / errors without importing the full
 * telemetry module themselves.
 *
 * @internal
 */
const telemetryManagers = new WeakMap<SanityInstance, TelemetryManager>()

/**
 * Initializes dev-mode telemetry for a SDK instance if the environment
 * qualifies. Both `telemetryManager` and `clientStore` are dynamically
 * imported to avoid circular dependencies and to keep telemetry code
 * out of production bundles via code splitting.
 *
 * The `projectId` must be passed explicitly because the resource
 * configuration is typically set by the React layer after the
 * instance has already been created.
 *
 * @internal
 */
export function initTelemetry(instance: SanityInstance, projectId: string): void {
  if (!isDevMode()) return
  if (!projectId) return

  Promise.all([
    import('./telemetryManager'),
    import('../client/clientStore'),
    import('../auth/authStore'),
  ])
    .then(async ([{createTelemetryManager}, {getClient}, {getTokenState}]) => {
      if (instance.isDisposed()) return

      // Wait for the auth store to resolve a token. The client needs a
      // Bearer token for the consent check and batch POSTs. If the token
      // is already available (e.g. static token config), this resolves
      // immediately. For OAuth/localStorage discovery it waits for the
      // first emission. For unauthenticated apps the promise never
      // resolves, which is fine since telemetry requires auth anyway.
      const token = getTokenState(instance).getCurrent()
      if (!token) {
        const hasToken = await new Promise<boolean>((resolve) => {
          if (instance.isDisposed()) return resolve(false)
          const unsub = instance.onDispose(() => resolve(false))
          const sub = getTokenState(instance).observable.subscribe((t) => {
            if (t) {
              sub.unsubscribe()
              unsub()
              resolve(true)
            }
          })
        })
        if (!hasToken || instance.isDisposed()) return
      }

      const manager = createTelemetryManager({
        sessionId: instance.instanceId,
        getClient: () => getClient(instance, {apiVersion: DEFAULT_TELEMETRY_API_VERSION}),
        projectId,
      })

      // Check consent before logging anything. If the user hasn't
      // opted in, discard the manager and skip all telemetry for
      // this session.
      const consented = await manager.checkConsent()
      if (!consented || instance.isDisposed()) {
        manager.endSession()
        return
      }

      telemetryManagers.set(instance, manager)

      const config = instance.config
      const perspective = typeof config.perspective === 'string' ? config.perspective : 'published'
      const authMethod = config.auth?.token
        ? 'token'
        : config.studio?.auth?.token
          ? 'studio'
          : 'default'
      const origin = typeof window !== 'undefined' ? window.location.origin : 'node'

      manager.logSessionStarted({
        projectId,
        perspective,
        authMethod,
        origin,
      })

      instance.onDispose(() => {
        manager.endSession()
        telemetryManagers.delete(instance)
      })
    })
    .catch(() => {
      // Telemetry init is best-effort; never break the SDK
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
