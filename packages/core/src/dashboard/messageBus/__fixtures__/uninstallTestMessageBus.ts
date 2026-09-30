import {resetMessageBus} from '../bus'
import {MESSAGE_BUS_KEY} from '../installed'

/** Tears down a bus installed with `installMessageBus`, so the next test starts without one. */
export function uninstallTestMessageBus(): void {
  resetMessageBus()
  delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
}
