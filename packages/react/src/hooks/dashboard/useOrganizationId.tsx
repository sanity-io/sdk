import {getDashboardOrganizationId} from '@sanity/sdk'

import {useDashboardState} from './useDashboardState'

const organizationIdFromCore = (organizationId: string | undefined) => organizationId
const organizationIdFromTopic = (organization: {id: string} | null) => organization?.id

/**
 * @public
 *
 * A React hook that retrieves the dashboard organization ID that is currently selected in the Sanity Dashboard.
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
  return useDashboardState(
    'organizations.current',
    getDashboardOrganizationId,
    organizationIdFromCore,
    organizationIdFromTopic,
  )
}
