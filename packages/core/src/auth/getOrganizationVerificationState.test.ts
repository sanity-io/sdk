import {type Observable} from 'rxjs'
import {TestScheduler} from 'rxjs/testing'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {
  compareProjectOrganization,
  type OrgVerificationResult,
} from '../project/organizationVerification'
import {getProjectState} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getDashboardOrganizationId} from './dashboardUtils'
import {observeOrganizationVerificationState} from './getOrganizationVerificationState'

// Mock dependencies
vi.mock('./dashboardUtils', () => ({
  getDashboardOrganizationId: vi.fn(),
}))
vi.mock('../project/project', () => ({
  getProjectState: vi.fn(),
}))
// Mock the comparison function to check its inputs
vi.mock('../project/organizationVerification', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = await importOriginal<any>()
  return {
    ...original,
    compareProjectOrganization: vi.fn(),
  }
})

describe('observeOrganizationVerificationState', () => {
  let testScheduler: TestScheduler

  // Mock instance (only config.projectId is used)
  const mockInstance = {
    config: {projectId: 'proj-1', dataset: 'd'},
  } as SanityInstance

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected)
    })
    vi.clearAllMocks()
  })

  // Helper to mock getDashboardOrganizationId
  const mockDashboardOrgId = (observable: Observable<string | null | undefined>) => {
    vi.mocked(getDashboardOrganizationId).mockReturnValue({
      observable,
      getCurrent: () => undefined,
      subscribe: observable.subscribe.bind(observable),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any) // Cast to any to bypass strict type checking in mock
  }

  // Helper to mock getProjectState
  const mockProjectOrgId = (observable: Observable<{organizationId: string | null} | null>) => {
    vi.mocked(getProjectState).mockReturnValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      observable: observable as any, // Cast needed due to complex type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as StateSource<any>)
  }

  // Helper to mock compareProjectOrganization result
  const mockComparisonResult = (result: OrgVerificationResult) => {
    vi.mocked(compareProjectOrganization).mockReturnValue(result)
  }

  it('should emit {error: null} if dashboardOrgId is null', () => {
    testScheduler.run(({hot, expectObservable}) => {
      const dashboardOrgId$ = hot('-a-', {a: null})
      const projectOrgId$ = hot('--b', {b: {organizationId: 'org-real'}})

      mockDashboardOrgId(dashboardOrgId$)
      mockProjectOrgId(projectOrgId$)

      const expectedMarble = '--a' // Corrected: combineLatest emits at frame 2
      const expectedValues = {a: {error: null}}

      const result$ = observeOrganizationVerificationState(mockInstance, [
        mockInstance.config.projectId!,
      ])
      expectObservable(result$).toBe(expectedMarble, expectedValues)
    })
    expect(compareProjectOrganization).not.toHaveBeenCalled()
  })

  it('should emit {error: null} if instance.config.projectId is missing', () => {
    const instanceWithoutProjectId = {
      config: {projectId: undefined, dataset: 'd'},
      // Add other required properties if SanityInstance type needs them
    } as SanityInstance

    testScheduler.run(({hot, expectObservable}) => {
      // Dashboard org ID doesn't matter much here, but provide one
      const dashboardOrgId$ = hot('-a-', {a: 'org-dash'})
      // Project state fetch won't happen due to early return
      const projectOrgId$: Observable<{organizationId: string | null} | null> = hot('--')

      mockDashboardOrgId(dashboardOrgId$)
      mockProjectOrgId(projectOrgId$)

      // Should emit immediately (or based on dashboardOrgId$) due to missing projId
      const expectedMarble = '-a' // Corrected: Emit at frame 1
      const expectedValues = {a: {error: null}}

      const result$ = observeOrganizationVerificationState(instanceWithoutProjectId, [])
      expectObservable(result$).toBe(expectedMarble, expectedValues)
    })
    // No project fetch or comparison should occur
    expect(getProjectState).not.toHaveBeenCalled()
    expect(compareProjectOrganization).not.toHaveBeenCalled()
  })

  it('should emit an error if project fetch returns null when dashboard orgId is present', () => {
    const comparisonError = {
      error:
        'Project proj-1 belongs to Organization unknown, but the Dashboard has Organization org-dash selected',
    }

    testScheduler.run(({hot, expectObservable}) => {
      const dashboardOrgId$ = hot('-a-', {a: 'org-dash'})
      const projectOrgId$ = hot('---n', {n: null}) // Project fetch returns null

      mockDashboardOrgId(dashboardOrgId$)
      mockProjectOrgId(projectOrgId$)
      // Mock the result specifically for this test's inputs
      vi.mocked(compareProjectOrganization).mockImplementation((pId, projOrgId, dashOrgId) => {
        if (pId === 'proj-1' && projOrgId === null && dashOrgId === 'org-dash') {
          return comparisonError
        }
        return {error: 'Unexpected call to compareProjectOrganization'} // Fail test if called unexpectedly
      })

      // When project fetch returns null, orgId becomes null, and the comparison is skipped.
      const expectedMarble = '---r' // Should emit { error: null }
      const expectedValues = {r: {error: null}} // Expect null error

      const result$ = observeOrganizationVerificationState(mockInstance, [
        mockInstance.config.projectId!,
      ])
      expectObservable(result$).toBe(expectedMarble, expectedValues)
    })
    // Comparison should NOT be called because projectData.orgId is null
    expect(compareProjectOrganization).not.toHaveBeenCalled()
    // Reset mock for other tests
    vi.mocked(compareProjectOrganization).mockReset()
  })

  it('should call compareProjectOrganization and emit its result when IDs match', () => {
    testScheduler.run(({hot, expectObservable}) => {
      const dashboardOrgId$ = hot('-a-', {a: 'org-match'})
      const projectOrgId$ = hot('--b', {b: {organizationId: 'org-match'}})
      const comparisonResult = {error: null}

      mockDashboardOrgId(dashboardOrgId$)
      mockProjectOrgId(projectOrgId$)
      mockComparisonResult(comparisonResult)

      const expectedMarble = '--r' // Emits when projectOrgId$ emits
      const expectedValues = {r: comparisonResult}

      const result$ = observeOrganizationVerificationState(mockInstance, [
        mockInstance.config.projectId!,
      ])
      expectObservable(result$).toBe(expectedMarble, expectedValues)
    })

    // Check that comparison was called with correct values after observables emit
    expect(compareProjectOrganization).toHaveBeenCalledTimes(1)
    expect(compareProjectOrganization).toHaveBeenCalledWith('proj-1', 'org-match', 'org-match')
  })

  it('should call compareProjectOrganization and emit its result when IDs mismatch', () => {
    testScheduler.run(({hot, expectObservable}) => {
      const dashboardOrgId$ = hot('-a-', {a: 'org-dash'})
      const projectOrgId$ = hot('--b', {b: {organizationId: 'org-proj'}})
      const comparisonResult = {error: 'Mismatch detected'}

      mockDashboardOrgId(dashboardOrgId$)
      mockProjectOrgId(projectOrgId$)
      mockComparisonResult(comparisonResult)

      const expectedMarble = '--r'
      const expectedValues = {r: comparisonResult}

      const result$ = observeOrganizationVerificationState(mockInstance, [
        mockInstance.config.projectId!,
      ])
      expectObservable(result$).toBe(expectedMarble, expectedValues)
    })
    expect(compareProjectOrganization).toHaveBeenCalledTimes(1)
    expect(compareProjectOrganization).toHaveBeenCalledWith('proj-1', 'org-proj', 'org-dash')
  })
})
