import {resetMessageBus} from '../bus'

/** Tears down a bus installed with `installMessageBus`, so the next test starts without one. */
export function uninstallTestMessageBus(): void {
  resetMessageBus()
  delete (globalThis as {[key: symbol]: unknown})[Symbol.for('sanity.os.bus')]
}
