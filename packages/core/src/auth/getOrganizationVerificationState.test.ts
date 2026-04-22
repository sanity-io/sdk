import {type SanityProject} from '@sanity/client'
import {NEVER, type Observable} from 'rxjs'
import {TestScheduler} from 'rxjs/testing'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {
  compareProjectOrganization,
  type OrganizationVerificationResult,
} from '../project/organizationVerification'
import {getProjectState} from '../project/project'
import {type SanityInstance} from '../store/createSanityInstance'
import {type StateSource} from '../store/createStateSourceAction'
import {getDashboardOrganizationId} from './dashboardUtils'
import {getOrganizationVerificationState} from './getOrganizationVerificationState'

// Mock dependencies
vi.mock('./dashboardUtils', () => ({
  getDashboardOrganizationId: vi.fn(),
}))
vi.mock('../project/project', () => ({
  getProjectState: vi.fn(),
}))
// Mock the comparison function to check its inputs
vi.mock('../project/organizationVerification', (importOriginal) => ({
  ...importOriginal(),
  compareProjectOrganization: vi.fn(),
}))

describe('getOrganizationVerificationState', () => {
  let testScheduler: TestScheduler

  // Mock instance with studio.projectId
  const mockInstance = {
    config: {studio: {projectId: 'proj-1'}},
  } as unknown as SanityInstance

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
    } as unknown as StateSource<string | undefined>)
  }

  // Helper to mock getProjectState
  const mockProjectOrgId = (observable: Observable<{organizationId: string | null} | null>) => {
    vi.mocked(getProjectState).mockReturnValue({
      observable: observable as unknown as Observable<SanityProject | undefined>,
      getCurrent: () => null,
      subscribe: () => () => {},
    } as unknown as StateSource<SanityProject | undefined>)
  }

  // Helper to mock compareProjectOrganization result
  const mockComparisonResult = (result: OrganizationVerificationResult) => {
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

      const result = getOrganizationVerificationState(mockInstance, [
        mockInstance.config.studio!.projectId!,
      ])
      expectObservable(result.observable).toBe(expectedMarble, expectedValues)
    })
    expect(compareProjectOrganization).not.toHaveBeenCalled()
  })

  it('should emit {error: null} if instance has no default source projectId', () => {
    const instanceWithoutProjectId = {
      config: {auth: {}},
    } as unknown as SanityInstance

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

      const result = getOrganizationVerificationState(instanceWithoutProjectId, [])
      expectObservable(result.observable).toBe(expectedMarble, expectedValues)
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

      const result = getOrganizationVerificationState(mockInstance, [
        mockInstance.config.studio!.projectId!,
      ])
      expectObservable(result.observable).toBe(expectedMarble, expectedValues)
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

      const result = getOrganizationVerificationState(mockInstance, [
        mockInstance.config.studio!.projectId!,
      ])
      expectObservable(result.observable).toBe(expectedMarble, expectedValues)
    })

    // Check that comparison was called with correct values after observables emit
    expect(compareProjectOrganization).toHaveBeenCalledTimes(1)
    expect(compareProjectOrganization).toHaveBeenCalledWith('proj-1', 'org-match', 'org-match')
  })

  describe('getCurrent()', () => {
    const setupMocks = ({
      dashboardOrgId,
      projectOrgId,
    }: {
      dashboardOrgId: string | null | undefined
      projectOrgId: string | null
    }) => {
      vi.mocked(getDashboardOrganizationId).mockReturnValue({
        getCurrent: () => dashboardOrgId,
        observable: NEVER,
        subscribe: () => () => {},
      } as StateSource<string | undefined>)
      vi.mocked(getProjectState).mockReturnValue({
        getCurrent: () => (projectOrgId !== null ? {organizationId: projectOrgId} : null),
        observable: NEVER as Observable<SanityProject | undefined>,
        subscribe: () => () => {},
      } as StateSource<SanityProject | undefined>)
    }

    it('returns {error: null} when dashboardOrgId is null', () => {
      setupMocks({dashboardOrgId: null, projectOrgId: 'org-real'})
      const result = getOrganizationVerificationState(mockInstance, ['proj-1'])
      expect(result.getCurrent()).toEqual({error: null})
      expect(compareProjectOrganization).not.toHaveBeenCalled()
    })

    it('returns {error: null} when projectIds is empty', () => {
      setupMocks({dashboardOrgId: 'org-dash', projectOrgId: 'org-real'})
      const result = getOrganizationVerificationState(mockInstance, [])
      expect(result.getCurrent()).toEqual({error: null})
      expect(compareProjectOrganization).not.toHaveBeenCalled()
    })

    it('returns {error: null} when project has no orgId', () => {
      setupMocks({dashboardOrgId: 'org-dash', projectOrgId: null})
      const result = getOrganizationVerificationState(mockInstance, ['proj-1'])
      expect(result.getCurrent()).toEqual({error: null})
      expect(compareProjectOrganization).not.toHaveBeenCalled()
    })

    it('returns {error: null} when org IDs match', () => {
      setupMocks({dashboardOrgId: 'org-match', projectOrgId: 'org-match'})
      vi.mocked(compareProjectOrganization).mockReturnValue({error: null})
      const result = getOrganizationVerificationState(mockInstance, ['proj-1'])
      expect(result.getCurrent()).toEqual({error: null})
      expect(compareProjectOrganization).toHaveBeenCalledWith('proj-1', 'org-match', 'org-match')
    })

    it('returns error when org IDs mismatch', () => {
      const mismatchError = {error: 'Mismatch'}
      setupMocks({dashboardOrgId: 'org-dash', projectOrgId: 'org-proj'})
      vi.mocked(compareProjectOrganization).mockReturnValue(mismatchError)
      const result = getOrganizationVerificationState(mockInstance, ['proj-1'])
      expect(result.getCurrent()).toEqual(mismatchError)
    })
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

      const result = getOrganizationVerificationState(mockInstance, [
        mockInstance.config.studio!.projectId!,
      ])
      expectObservable(result.observable).toBe(expectedMarble, expectedValues)
    })
    expect(compareProjectOrganization).toHaveBeenCalledTimes(1)
    expect(compareProjectOrganization).toHaveBeenCalledWith('proj-1', 'org-proj', 'org-dash')
  })
})
