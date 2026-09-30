/**
 * The global a dashboard host installs its message bus under.
 * @internal
 */
export const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')

/**
 * Marks a message bus as a compatible registry.
 * @internal
 */
export const MESSAGE_BUS_REGISTRY_KEY = Symbol.for('sanity.os.registry')

/**
 * Returns whether a message bus registry is installed.
 * @internal
 */
export function isMessageBusInstalled(): boolean {
  const bus = (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
  return typeof bus === 'object' && bus !== null && MESSAGE_BUS_REGISTRY_KEY in bus
}
