import {combineLatest, distinctUntilChanged, map, type Observable, of, switchMap} from 'rxjs'

import {observeAppOrganizationId} from '../organization/appOrganization'
import {
  compareProjectOrganization,
  type OrgVerificationResult,
} from '../project/organizationVerification'
import {project} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'

/**
 * Creates an observable that emits the organization verification state for a given instance.
 * It combines the app's own organization ID with each project's actual
 * organization ID (fetched via the project fetcher) and compares them.
 *
 * The app's organization is the Dashboard's when there is one, and
 * `organizationId` on the `SanityConfig` otherwise, so a standalone app that
 * names its organization gets the same check a Dashboard app does.
 * @public
 */
export function observeOrganizationVerificationState(
  instance: SanityInstance,
  projectIds: string[],
): Observable<OrgVerificationResult> {
  // Observable for the app's org ID (potentially undefined)
  const appOrgId$ = observeAppOrganizationId(instance).pipe(distinctUntilChanged())

  // Create observables for each project's org ID
  const projectOrgIdObservables = projectIds.map((id) =>
    project.getState(instance, {projectId: id}).observable.pipe(
      map((snapshot) => ({projectId: id, orgId: snapshot.data?.organizationId ?? null})),
      // Ensure we only proceed if the orgId is loaded, distinct prevents unnecessary checks
      distinctUntilChanged((prev, curr) => prev.orgId === curr.orgId),
    ),
  )

  // Combine observables to get all project org IDs
  const allProjectOrgIds$ =
    projectOrgIdObservables.length > 0 ? combineLatest(projectOrgIdObservables) : of([])

  // Combine the sources
  return combineLatest([appOrgId$, allProjectOrgIds$]).pipe(
    switchMap(([appOrgId, projectOrgDataArray]) => {
      // If no app org ID is set, or no project IDs provided, verification isn't applicable/possible
      if (!appOrgId || projectOrgDataArray.length === 0) {
        return of<OrgVerificationResult>({error: null}) // Return success (no error)
      }

      // Iterate through all projects and check organization IDs
      for (const projectData of projectOrgDataArray) {
        // If a project doesn't have an orgId, we can't verify, treat as non-blocking for now
        // (Matches original logic where null projectOrgId resulted in {error: null})
        if (!projectData.orgId) {
          continue
        }

        // Perform the comparison for the current project
        const result = compareProjectOrganization(
          projectData.projectId,
          projectData.orgId,
          appOrgId,
        )

        // If any project fails verification, immediately return the error
        if (result.error) {
          return of(result)
        }
      }

      // If all projects passed verification (or had no orgId to check)
      return of<OrgVerificationResult>({error: null})
    }),
    // Only emit when the overall error status actually changes
    distinctUntilChanged((prev, curr) => prev.error === curr.error),
  )
}
