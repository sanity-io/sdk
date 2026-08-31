import {AuthStateType, setAuthToken} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {useAuthState} from '../hooks/auth/useAuthState'
import {DashboardTokenRefreshProvider} from './DashboardTokenRefresh'
import {ResourceProvider} from './ResourceProvider'

const messageBus = vi.hoisted(() => ({
  client: undefined as
    | undefined
    | {emit: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>},
  emit: vi.fn(),
  subscribe: vi.fn(),
}))

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

vi.mock('../dashboard/messageBus/client', () => ({
  get dashboardMessageBus() {
    return messageBus.client
  },
  isDashboardEnvironment: () => messageBus.client !== undefined,
}))

const mockSetAuthToken = setAuthToken as Mock
const mockUseAuthState = useAuthState as Mock

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
    messageBus.client = undefined
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when not in the dashboard', () => {
    it('does not subscribe to a dashboard token', () => {
      act(() => {
        renderProvider()
      })

      expect(mockSetAuthToken).not.toHaveBeenCalled()
    })
  })

  describe('when in the dashboard', () => {
    beforeEach(() => {
      messageBus.client = messageBus
      messageBus.subscribe.mockReturnValue(of('dashboard-token'))
    })

    it('mirrors the dashboard token into the auth store', () => {
      act(() => {
        renderProvider()
      })

      expect(mockSetAuthToken).toHaveBeenCalledWith(expect.anything(), 'dashboard-token')
    })

    it('treats subscription failures as a missing token', () => {
      messageBus.subscribe.mockImplementationOnce(() => {
        throw new Error('Incompatible message bus')
      })

      expect(() => {
        act(() => {
          renderProvider()
        })
      }).not.toThrow()
      expect(mockSetAuthToken).toHaveBeenCalledWith(expect.anything(), null)
    })

    it('asks the message bus to reissue the token on a 401', () => {
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

      expect(messageBus.emit).toHaveBeenCalledWith('auth.token.refresh', undefined)
    })
  })
})
