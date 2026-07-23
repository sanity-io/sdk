import {AuthStateType, setAuthToken} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {useAuthState} from '../hooks/auth/useAuthState'
import {ResourceProvider} from './ResourceProvider'
import {
  isWorkbenchEnvironment,
  observeWorkbenchToken,
  refreshWorkbenchToken,
} from './workbenchToken'
import {WorkbenchTokenRefreshProvider} from './WorkbenchTokenRefresh'

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

vi.mock('./workbenchToken', () => ({
  isWorkbenchEnvironment: vi.fn(() => false),
  observeWorkbenchToken: vi.fn(() => undefined),
  refreshWorkbenchToken: vi.fn(),
}))

const mockSetAuthToken = setAuthToken as Mock
const mockUseAuthState = useAuthState as Mock
const mockIsWorkbenchEnvironment = isWorkbenchEnvironment as Mock
const mockObserveWorkbenchToken = observeWorkbenchToken as Mock
const mockRefreshWorkbenchToken = refreshWorkbenchToken as Mock

const renderProvider = () =>
  render(
    <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
      <WorkbenchTokenRefreshProvider>
        <div>Test</div>
      </WorkbenchTokenRefreshProvider>
    </ResourceProvider>,
  )

describe('WorkbenchTokenRefreshProvider', () => {
  beforeEach(() => {
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when not in the workbench', () => {
    it('does not subscribe to the OS token', () => {
      mockIsWorkbenchEnvironment.mockReturnValue(false)

      act(() => {
        renderProvider()
      })

      expect(mockSetAuthToken).not.toHaveBeenCalled()
    })
  })

  describe('when in the workbench', () => {
    beforeEach(() => {
      mockIsWorkbenchEnvironment.mockReturnValue(true)
    })

    it('mirrors the OS token into the auth store', () => {
      mockObserveWorkbenchToken.mockReturnValue(of('workbench-token'))

      act(() => {
        renderProvider()
      })

      expect(mockSetAuthToken).toHaveBeenCalledWith(expect.anything(), 'workbench-token')
    })

    it('asks the OS to reissue the token on a 401', () => {
      mockObserveWorkbenchToken.mockReturnValue(of('workbench-token'))

      const {rerender} = renderProvider()

      mockUseAuthState.mockReturnValue({
        type: AuthStateType.ERROR,
        error: {statusCode: 401, message: 'Unauthorized'},
      })
      act(() => {
        rerender(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <WorkbenchTokenRefreshProvider>
              <div>Test</div>
            </WorkbenchTokenRefreshProvider>
          </ResourceProvider>,
        )
      })

      expect(mockRefreshWorkbenchToken).toHaveBeenCalledTimes(1)
    })
  })
})
