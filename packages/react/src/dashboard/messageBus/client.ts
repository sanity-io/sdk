import {connectMessageBus, isMessageBusInstalled, type MessageBus} from './bus'

let dashboardMessageBus: MessageBus | undefined

/** Returns the shared message bus connection for this dashboard application. */
export function getDashboardMessageBus(): MessageBus | undefined {
  // An absent host is retried because remotes can load before Workbench installs the bus.
  if (!dashboardMessageBus && isMessageBusInstalled()) {
    dashboardMessageBus = connectMessageBus()
  }
  return dashboardMessageBus
}

/** Returns whether this application is connected to an installed dashboard message bus. */
export function isDashboardEnvironment(): boolean {
  return getDashboardMessageBus() !== undefined
}
