import {getDashboardMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusConnection} from '@sanity/sdk/dashboard'
import {useContext} from 'react'

import {getDashboardRootContext} from '../../dashboard/module'
import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Returns the instance's message bus connection, or `undefined` outside a Dashboard. It connects
 * with the module id and parent key the CLI wrapper provides, so a host reads its own `key` here
 * to pass as the `parentKey` of the modules it renders.
 *
 * @remarks
 * Safe to call on every render: the connection is cached on the instance, so each call returns
 * the same one, and only the first call's identity is used.
 * @internal
 */
export function useMessageBus(): MessageBusConnection | undefined {
  const instance = useSanityInstance()
  const root = useContext(getDashboardRootContext())
  return getDashboardMessageBus(instance, root?.moduleId, root?.parentKey)
}
