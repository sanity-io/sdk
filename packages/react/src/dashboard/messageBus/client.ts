import {connectMessageBus, type MessageBus} from './bus'

/** The shared message bus connection for this dashboard application. */
export const dashboardMessageBus = connectMessageBus()

/** Returns whether this application is connected to an installed dashboard message bus. */
export function isDashboardEnvironment(
  client: MessageBus | undefined = dashboardMessageBus,
): client is MessageBus {
  return client !== undefined
}
