import {distinctUntilChanged, map} from 'rxjs'

import {authStore, getIsInDashboardState} from '../../auth/authStore'
import {bindActionGlobally, createActionBinder} from '../../store/createActionBinder'
import {type SanityInstance} from '../../store/createSanityInstance'
import {createStateSourceAction, type StateSource} from '../../store/createStateSourceAction'
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
 * Returns the instance's message bus connection, or throws when no dashboard host has
 * installed a bus. `action` names what the caller was about to do, e.g. `read topic "x"`.
 * @internal
 */
export function requireDashboardMessageBus(
  instance: SanityInstance,
  action: string,
): MessageBusConnection {
  const messageBus = getDashboardMessageBus(instance)
  if (!messageBus) {
    throw new Error(`Cannot ${action} without an installed dashboard message bus`)
  }
  return messageBus
}

/**
 * Returns whether a dashboard hosts the instance, over Comlink or an installed message bus.
 *
 * @remarks
 * Answers "does a host own this session", not "has this instance connected yet". Callers
 * such as the login redirect run before {@link getDashboardMessageBus} has been called for
 * the instance, so this must not depend on the connection state.
 * @internal
 */
export function isDashboardEnvironment(instance: SanityInstance): boolean {
  return getIsInDashboardState(instance).getCurrent() || isMessageBusInstalled()
}

const getComlinkOrganizationId = bindActionGlobally(
  authStore,
  createStateSourceAction(({state: {dashboardContext}}) => dashboardContext?.orgId),
)

/**
 * @public
 */
export function getDashboardOrganizationId(
  instance: SanityInstance,
): StateSource<string | undefined> {
  const messageBus = getDashboardMessageBus(instance)
  if (!messageBus) return getComlinkOrganizationId(instance)
  const organization = messageBus.subscribe('organizations.current')
  return {
    getCurrent: () => organization.getCurrent()?.id,
    subscribe: (onStoreChanged) => {
      const subscription = organization.subscribe(() => onStoreChanged?.())
      return () => subscription.unsubscribe()
    },
    observable: organization.pipe(
      map((value) => value?.id),
      distinctUntilChanged(),
    ),
  }
}
