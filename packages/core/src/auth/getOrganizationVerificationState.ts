import {combineLatest, distinctUntilChanged, map, type Observable, of, switchMap} from 'rxjs'

import {
  compareProjectOrganization,
  type OrgVerificationResult,
} from '../project/organizationVerification'
import {getProjectState} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {getDashboardOrganizationId} from './dashboardUtils'

/**
 * Creates an observable that emits the organization verification state for a given instance.
 * It combines the dashboard organization ID (from auth context) with the
 * project's actual organization ID (fetched via getProjectState) and compares them.
 * @public
 */
export function observeOrganizationVerificationState(
  instance: SanityInstance,
): Observable<OrgVerificationResult> {
  // Observable for the dashboard org ID (potentially null)
  const dashboardOrgId$ =
    getDashboardOrganizationId(instance).observable.pipe(distinctUntilChanged())

  // Get the primary project ID from config
  const projectId = instance.config.projectId

  // Observable for the project's actual org ID (potentially null)
  const projectOrgId$ = !projectId
    ? of(null) // No project ID, emit null
    : getProjectState(instance, {projectId}).observable.pipe(
        map((project) => project?.organizationId ?? null), // Extract orgId or null
        distinctUntilChanged(),
      )

  // Combine the sources
  return combineLatest([dashboardOrgId$, projectOrgId$, of(projectId)]).pipe(
    switchMap(([dashboardOrgId, projectOrgIdValue, projId]) => {
      // If no dashboard org ID is set, or no project ID is configured, verification isn't applicable
      if (!dashboardOrgId || !projId) {
        return of<OrgVerificationResult>({error: null}) // Return success (no error)
      }

      // We have both IDs, perform the comparison synchronously
      const result = compareProjectOrganization(projId, projectOrgIdValue, dashboardOrgId)
      return of(result)
    }),
    // Only emit when the error status actually changes
    distinctUntilChanged((prev, curr) => prev.error === curr.error),
  )
}
