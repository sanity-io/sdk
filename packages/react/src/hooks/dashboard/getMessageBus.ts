import {type SanityInstance} from '@sanity/sdk'
import {getDashboardMessageBus} from '@sanity/sdk/_internal'
import {type MessageBus} from '@sanity/sdk/dashboard'

/**
 * Returns the dashboard message bus for an instance, or throws when the hook runs outside a
 * dashboard application.
 * @internal
 */
export function getMessageBus(instance: SanityInstance, hook: string): MessageBus {
  const messageBus = getDashboardMessageBus(instance)
  if (!messageBus) throw new Error(`${hook} must be used inside a dashboard application`)
  return messageBus
}
