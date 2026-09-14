import {AuthStateType, setAuthToken} from '@sanity/sdk'
import {getDashboardMessageBus} from '@sanity/sdk/_internal'
import {act, render} from '@testing-library/react'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getDashboardModuleContext} from '../dashboard/module'
import {useAuthState} from '../hooks/auth/useAuthState'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {DashboardTokenRefreshProvider} from './DashboardTokenRefresh'
import {ResourceProvider} from './ResourceProvider'

const messageBus = vi.hoisted(() => ({
  client: undefined as
    | undefined
    | {emit: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>},
  emit: vi.fn(),
  subscribe: vi.fn(),
  // A spy so tests can observe the forwarded arguments.
  getDashboardMessageBus: vi.fn(),
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
  getDashboardMessageBus: messageBus.getDashboardMessageBus,
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
    messageBus.getDashboardMessageBus.mockReset()
    messageBus.getDashboardMessageBus.mockImplementation(() => messageBus.client)
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

    it('renders children bare when no host bus is installed', () => {
      messageBus.client = undefined

      act(() => {
        renderProvider()
      })

      expect(messageBus.getDashboardMessageBus).toHaveBeenCalledTimes(1)
      expect(mockSetAuthToken).not.toHaveBeenCalled()
    })

    it('connects with the module id before any child reads the bus during render', () => {
      // getDashboardMessageBus is first-caller-wins per instance. A hook reading the bus in
      // its render runs before any parent effect, so the provider must connect during render
      // or the connection is pinned to the app id.
      const ModuleContext = getDashboardModuleContext()
      function ReadsBus() {
        getDashboardMessageBus(useSanityInstance())
        return null
      }

      act(() => {
        render(
          <ModuleContext.Provider value="favorites/views/list/panel">
            <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
              <DashboardTokenRefreshProvider>
                <ReadsBus />
              </DashboardTokenRefreshProvider>
            </ResourceProvider>
          </ModuleContext.Provider>,
        )
      })

      expect(messageBus.getDashboardMessageBus.mock.calls[0]).toEqual([
        expect.anything(),
        'favorites/views/list/panel',
      ])
    })

    it('forwards the module id from the dashboard module context', () => {
      const ModuleContext = getDashboardModuleContext()

      act(() => {
        render(
          <ModuleContext.Provider value="favorites/views/list/panel">
            <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
              <DashboardTokenRefreshProvider>
                <div>Test</div>
              </DashboardTokenRefreshProvider>
            </ResourceProvider>
          </ModuleContext.Provider>,
        )
      })

      expect(messageBus.getDashboardMessageBus).toHaveBeenCalledWith(
        expect.anything(),
        'favorites/views/list/panel',
      )
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
