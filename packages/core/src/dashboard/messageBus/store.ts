import {createActionBinder} from '../../store/createActionBinder'
import {type SanityInstance} from '../../store/createSanityInstance'
import {createStateSourceAction} from '../../store/createStateSourceAction'
import {defineStore} from '../../store/defineStore'
import {connectMessageBus, isMessageBusInstalled, type MessageBusConnection} from './bus'

interface DashboardMessageBusState {
  connection?: MessageBusConnection
}

const bindActionByInstance = createActionBinder<{name: string}, [moduleId?: string]>(
  (instance) => ({name: instance.instanceId}),
)

const dashboardMessageBusStore = defineStore<DashboardMessageBusState>({
  name: 'dashboardMessageBus',
  getInitialState: () => ({}),
  // Runs when the instance is disposed, tearing down this window's connection.
  initialize:
    ({state}) =>
    () =>
      state.get().connection?.disconnect(),
})

/**
 * Returns the message bus connection for this instance, connecting on first call.
 *
 * @remarks
 * One connection is made per {@link SanityInstance}, carrying that window's
 * module identity. The first caller wins; later callers get the cached
 * connection. When no host bus is installed it returns `undefined` without
 * caching, so a later call retries once a host installs the bus.
 * @internal
 */
export const getDashboardMessageBus = bindActionByInstance(
  dashboardMessageBusStore,
  ({state}, moduleId?: string): MessageBusConnection | undefined => {
    const current = state.get().connection
    if (current) return current
    if (!isMessageBusInstalled()) return undefined
    const connection = connectMessageBus({moduleId})
    if (!connection) return undefined
    state.set('connect', {connection})
    return connection
  },
)

/**
 * A state source reporting whether this instance is connected to a dashboard bus.
 * @internal
 */
export const getDashboardEnvironmentState = bindActionByInstance(
  dashboardMessageBusStore,
  createStateSourceAction(({state}: {state: DashboardMessageBusState}) =>
    Boolean(state.connection),
  ),
)

/**
 * Returns whether this instance is connected to an installed dashboard message bus.
 * @internal
 */
export function isDashboardEnvironment(instance: SanityInstance): boolean {
  return getDashboardEnvironmentState(instance).getCurrent()
}
