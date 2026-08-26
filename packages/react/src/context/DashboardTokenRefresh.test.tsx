import {AuthStateType, setAuthToken} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {useAuthState} from '../hooks/auth/useAuthState'
import {
  isDashboardEnvironment,
  observeDashboardToken,
  refreshDashboardToken,
} from './dashboardToken'
import {DashboardTokenRefreshProvider} from './DashboardTokenRefresh'
import {ResourceProvider} from './ResourceProvider'

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    setAuthToken: vi.fn(),
  }
})

vi.mock('../hooks/auth/useAuthState', () => ({
  useAuthState: vi.fn(),
}))

vi.mock('./dashboardToken', () => ({
  isDashboardEnvironment: vi.fn(() => false),
  observeDashboardToken: vi.fn(() => undefined),
  refreshDashboardToken: vi.fn(),
}))

const mockSetAuthToken = setAuthToken as Mock
const mockUseAuthState = useAuthState as Mock
const mockIsDashboardEnvironment = isDashboardEnvironment as Mock
const mockObserveDashboardToken = observeDashboardToken as Mock
const mockRefreshDashboardToken = refreshDashboardToken as Mock

const renderProvider = () =>
  render(
    <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
      <DashboardTokenRefreshProvider>
        <div>Test</div>
      </DashboardTokenRefreshProvider>
    </ResourceProvider>,
  )

describe('DashboardTokenRefreshProvider', () => {
  beforeEach(() => {
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when not in the dashboard', () => {
    it('does not subscribe to the OS token', () => {
      mockIsDashboardEnvironment.mockReturnValue(false)

      act(() => {
        renderProvider()
      })

      expect(mockSetAuthToken).not.toHaveBeenCalled()
    })
  })

  describe('when in the dashboard', () => {
    beforeEach(() => {
      mockIsDashboardEnvironment.mockReturnValue(true)
    })

    it('mirrors the OS token into the auth store', () => {
      mockObserveDashboardToken.mockReturnValue(of('dashboard-token'))

      act(() => {
        renderProvider()
      })

      expect(mockSetAuthToken).toHaveBeenCalledWith(expect.anything(), 'dashboard-token')
    })

    it('asks the OS to reissue the token on a 401', () => {
      mockObserveDashboardToken.mockReturnValue(of('dashboard-token'))

      const {rerender} = renderProvider()

      mockUseAuthState.mockReturnValue({
        type: AuthStateType.ERROR,
        error: {statusCode: 401, message: 'Unauthorized'},
      })
      act(() => {
        rerender(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <DashboardTokenRefreshProvider>
              <div>Test</div>
            </DashboardTokenRefreshProvider>
          </ResourceProvider>,
        )
      })

      expect(mockRefreshDashboardToken).toHaveBeenCalledTimes(1)
    })
  })
})
