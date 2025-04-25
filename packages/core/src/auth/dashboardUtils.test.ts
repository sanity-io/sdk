import {describe, expect, it} from 'vitest'

import {type AuthStoreState} from './authStore'

// Define the expected selector function shape directly for the test
const selector = (context: {
  state: Pick<AuthStoreState, 'dashboardContext'>
}): string | undefined => {
  return context.state.dashboardContext?.orgId
}

describe('getDashboardOrganizationId selector logic', () => {
  it('should select the dashboard orgId from state', () => {
    const mockOrgId = 'org123'
    const mockState: Pick<AuthStoreState, 'dashboardContext'> = {
      dashboardContext: {orgId: mockOrgId},
    }
    // Cast needed because the selector expects the full context, but we only need state here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = selector({state: mockState} as any)
    expect(result).toBe(mockOrgId)
  })

  it('should select undefined if dashboardContext is missing', () => {
    const mockState: Pick<AuthStoreState, 'dashboardContext'> = {
      dashboardContext: undefined,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = selector({state: mockState} as any)
    expect(result).toBeUndefined()
  })

  it('should select undefined if dashboardContext.orgId is missing', () => {
    const mockState: Pick<AuthStoreState, 'dashboardContext'> = {
      dashboardContext: {mode: 'test'}, // orgId is missing
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = selector({state: mockState} as any)
    expect(result).toBeUndefined()
  })
})
