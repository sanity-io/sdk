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

vi.mock('@sanity/sdk/_internal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/sdk/_internal')>()),
  getDashboardMessageBus: () => messageBus.client,
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
      // `emit` returns a lazily-awaited reply the provider attaches a `.catch` to.
      messageBus.emit.mockReturnValue(Promise.resolve(undefined))
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

    it('logs a failed token reissue instead of dropping it silently', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      messageBus.emit.mockReturnValueOnce(Promise.reject(new Error('NO_RESPONDER')))
      const {rerender} = renderProvider()

      mockUseAuthState.mockReturnValue({
        type: AuthStateType.ERROR,
        error: {statusCode: 401, message: 'Unauthorized'},
      })
      await act(async () => {
        rerender(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <DashboardTokenRefreshProvider>
              <div>Test</div>
            </DashboardTokenRefreshProvider>
          </ResourceProvider>,
        )
      })

      expect(warn).toHaveBeenCalledWith(
        '[sanity/sdk] Dashboard token refresh failed:',
        expect.any(Error),
      )
    })
  })
})
