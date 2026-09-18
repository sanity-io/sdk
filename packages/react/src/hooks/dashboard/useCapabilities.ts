import {type TopicData} from '@sanity/sdk/dashboard'

import {useTopic} from './useTopic'

/**
 * Returns the capabilities the host provides.
 *
 * A capability is something the host provides; an application reads this record to hide its own
 * implementation of anything the host provides, or to skip publishing to a capability the host
 * does not have. A missing key means the host does not provide that capability.
 *
 * Suspends until the host publishes the record.
 *
 * @example
 * ```tsx
 * function UserMenu() {
 *   const {globalUserMenu} = useCapabilities()
 *   if (globalUserMenu) return null
 *   return <LocalUserMenu />
 * }
 * ```
 *
 * @public
 */
export function useCapabilities(): TopicData<'applications.capabilities'> {
  return useTopic('applications.capabilities')
}
