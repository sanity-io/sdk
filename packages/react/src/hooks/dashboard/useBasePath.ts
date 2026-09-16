import {requireDashboardMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusConnection, type MessageBusEmitResult} from '@sanity/sdk/dashboard'
import {use} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

const requests = new WeakMap<MessageBusConnection, MessageBusEmitResult<string | null>>()

/**
 * Returns the base path for the current dashboard application.
 *
 * Suspends until Dashboard resolves the path, or returns `null` when the application is unknown.
 *
 * @public
 */
export function useBasePath(): string | null {
  const instance = useSanityInstance()
  const messageBus = requireDashboardMessageBus(instance, 'request the application base path')
  let request = requests.get(messageBus)
  if (!request) {
    request = messageBus.emit('applications.basepath')
    requests.set(messageBus, request)
  }
  return use(request)
}
