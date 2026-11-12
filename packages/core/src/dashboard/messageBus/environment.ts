// Kept apart from `bus.ts`, so auth can check for the bus without loading it and the modules it
// imports, which include fetchers that need the fetcher store to have loaded first
declare const __SANITY_APP_ID__: string | undefined

/** @internal */
export const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
/** @internal */
export const MESSAGE_BUS_REGISTRY_KEY = Symbol.for('sanity.os.registry')

/**
 * The app ID passed in, or the one embedded by the Sanity CLI.
 * @internal
 */
export const resolveAppId = (appId?: string): string | undefined =>
  appId ?? (typeof __SANITY_APP_ID__ === 'string' ? __SANITY_APP_ID__ : undefined)

/**
 * The message bus installed on this page, if there is one.
 * @internal
 */
export function getInstalledMessageBus(): object | undefined {
  const bus = (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
  return typeof bus === 'object' && bus !== null && MESSAGE_BUS_REGISTRY_KEY in bus
    ? bus
    : undefined
}

/**
 * Returns whether a message bus registry is installed.
 * @internal
 */
export function isMessageBusInstalled(): boolean {
  return getInstalledMessageBus() !== undefined
}

/**
 * Returns whether this application installed the message bus and hosts the others on it.
 * @internal
 */
export function isMessageBusHost(): boolean {
  const installedMessageBus = getInstalledMessageBus()
  return (
    !!installedMessageBus &&
    (installedMessageBus as {[MESSAGE_BUS_REGISTRY_KEY]: {appId: string}})[MESSAGE_BUS_REGISTRY_KEY]
      .appId === resolveAppId()
  )
}

/**
 * Returns whether this application runs on an installed message bus.
 * @internal
 */
export function isMessageBusEnvironment(): boolean {
  return isMessageBusInstalled()
}
