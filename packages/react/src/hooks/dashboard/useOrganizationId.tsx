import {getDashboardOrganizationId, type OrganizationBase} from '@sanity/sdk'
import {getTopicState, isDashboardEnvironment} from '@sanity/sdk/_internal'
import {useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

type CurrentOrganization = Pick<OrganizationBase, 'id' | 'name' | 'slug'> | null | undefined

/**
 * @public
 *
 * A React hook that retrieves the dashboard organization ID that is currently selected in the Sanity Dashboard.
 *
 * Works in both Dashboard runtimes: it reads the `organizations.current` message bus topic when a
 * host has installed the bus, and falls back to the Comlink connection otherwise.
 *
 * @example
 * ```tsx
 * function DashboardComponent() {
 *   const orgId = useOrganizationId()
 *
 *   if (!orgId) return null
 *
 *   return <div>Organization ID: {String(orgId)}</div>
 * }
 * ```
 *
 * @category Dashboard
 * @returns The dashboard organization ID (string | undefined)
 */
export function useOrganizationId(): string | undefined {
  const instance = useSanityInstance()
  const {subscribe, getCurrent} = useMemo(() => {
    if (!isDashboardEnvironment()) return getDashboardOrganizationId(instance)
    const source = getTopicState(instance, 'organizations.current')
    return {
      subscribe: source.subscribe,
      getCurrent: () => (source.getCurrent() as CurrentOrganization)?.id ?? undefined,
    }
  }, [instance])

  return useSyncExternalStore(subscribe, getCurrent)
}
