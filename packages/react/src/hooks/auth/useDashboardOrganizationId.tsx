import {getDashboardOrganizationId} from '@sanity/sdk'
import {useMemo, useSyncExternalStore} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * @remarks
 * A React hook that retrieves the dashboard organization ID that is currently selected in the Sanity Dashboard.
 *
 * @example
 * ```tsx
 * function DashboardComponent() {
 *   const orgId = useDashboardOrganizationId()
 *
 *   if (!orgId) return null
 *
 *   return <div>Organization ID: {String(orgId)}</div>
 * }
 * ```
 *
 * @returns The dashboard organization ID (string | undefined)
 * @public
 */
export function useDashboardOrganizationId(): string | undefined {
  const instance = useSanityInstance()
  const {subscribe, getCurrent} = useMemo(() => getDashboardOrganizationId(instance), [instance])

  return useSyncExternalStore(subscribe, getCurrent)
}
