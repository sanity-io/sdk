import {combineLatest, distinctUntilChanged, map, of, share, skip, switchMap} from 'rxjs'

import {
  compareProjectOrganization,
  type OrganizationVerificationResult,
} from '../project/organizationVerification'
import {getProjectState} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getDashboardOrganizationId} from './dashboardUtils'

/**
 * Gets the organization verification state for a given instance.
 * It combines the dashboard organization ID (from auth context) with the
 * project's actual organization ID (fetched via getProjectState) and compares them.
 * @public
 */
export function getOrganizationVerificationState(
  instance: SanityInstance,
  projectIds: string[],
): StateSource<OrganizationVerificationResult> {
  const computeResult = (): OrganizationVerificationResult => {
    const dashboardOrgId = getDashboardOrganizationId(instance).getCurrent()
    const projectOrgDataArray = projectIds.map((id) => {
      const project = getProjectState(instance, {projectId: id}).getCurrent()
      return {projectId: id, orgId: project?.organizationId ?? null}
    })

    if (!dashboardOrgId || projectOrgDataArray.length === 0) {
      return {error: null}
    }

    for (const projectData of projectOrgDataArray) {
      if (!projectData.orgId) continue
      const result = compareProjectOrganization(
        projectData.projectId,
        projectData.orgId,
        dashboardOrgId,
      )
      if (result.error) return result
    }

    return {error: null}
  }

  const dashboardOrgId$ =
    getDashboardOrganizationId(instance).observable.pipe(distinctUntilChanged())

  // Create observables for each project's org ID
  const projectOrgIdObservables = projectIds.map((id) =>
    getProjectState(instance, {projectId: id}).observable.pipe(
      map((project) => ({projectId: id, orgId: project?.organizationId ?? null})),
      // Ensure we only proceed if the orgId is loaded, distinct prevents unnecessary checks
      distinctUntilChanged((prev, curr) => prev.orgId === curr.orgId),
    ),
  )

  // Combine observables to get all project org IDs
  const allProjectOrgIds$ =
    projectOrgIdObservables.length > 0 ? combineLatest(projectOrgIdObservables) : of([])

  const orgVerificationPipeline = () =>
    combineLatest([dashboardOrgId$, allProjectOrgIds$]).pipe(
      switchMap(([dashboardOrgId, projectOrgDataArray]) => {
        if (!dashboardOrgId || projectOrgDataArray.length === 0) {
          return of<OrganizationVerificationResult>({error: null})
        }

        for (const projectData of projectOrgDataArray) {
          // If a project doesn't have an orgId, we can't verify, treat as non-blocking for now
          if (!projectData.orgId) continue
          const result = compareProjectOrganization(
            projectData.projectId,
            projectData.orgId,
            dashboardOrgId,
          )
          // If any project fails verification, immediately return the error
          if (result.error) return of(result)
        }

        return of<OrganizationVerificationResult>({error: null})
      }),
      distinctUntilChanged((prev, curr) => prev.error === curr.error),
    )

  // Shared for efficient multicasting when multiple consumers subscribe to .observable
  const observable = orgVerificationPipeline().pipe(share())

  // Uses a fresh pipeline so skip(1) always has an initial emission to discard,
  // regardless of whether .observable already has active subscribers
  const subscribe = (onStoreChanged?: () => void): (() => void) => {
    const sub = orgVerificationPipeline()
      // the initial emission is the current state (see getCurrent), so we skip it
      .pipe(skip(1))
      .subscribe(() => onStoreChanged?.())
    return () => sub.unsubscribe()
  }

  return {getCurrent: computeResult, subscribe, observable}
}
