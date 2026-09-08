import {AuthStateType, setAuthToken} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {getDashboardModuleContext} from '../dashboard/module'
import {useAuthState} from '../hooks/auth/useAuthState'
import {DashboardTokenRefreshProvider} from './DashboardTokenRefresh'
import {ResourceProvider} from './ResourceProvider'

const messageBus = vi.hoisted(() => {
  // A minimal fake of the store's environment state source. `connected` is derived from
  // whether `getDashboardMessageBus` has handed out a client, mirroring the real store where
  // the state flips to true only once a connection is cached.
  const listeners = new Set<() => void>()
  let connected = false
  const setConnected = (next: boolean) => {
    if (connected === next) return
    connected = next
    for (const listener of listeners) listener()
  }
  return {
    client: undefined as
      | undefined
      | {emit: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>},
    emit: vi.fn(),
    subscribe: vi.fn(),
    // A spy so tests can observe the forwarded arguments and stage a late connection.
    getDashboardMessageBus: vi.fn(),
    environment: {
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getCurrent: () => connected,
    },
    setConnected,
    reset: () => {
      connected = false
      listeners.clear()
    },
  }
})

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
  getDashboardEnvironmentState: () => messageBus.environment,
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
    messageBus.reset()
    messageBus.getDashboardMessageBus.mockReset()
    // Like the real store: hand out the client and, once one exists, report connected.
    messageBus.getDashboardMessageBus.mockImplementation(() => {
      if (messageBus.client) messageBus.setConnected(true)
      return messageBus.client
    })
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

    it('attempts the connection only from the effect, never during render', () => {
      // With no host bus the store stays disconnected, so render must not call the action
      // (a store write during render would notify subscribers mid-render). The single call
      // observed is the effect's post-commit attempt.
      messageBus.client = undefined

      act(() => {
        renderProvider()
      })

      expect(messageBus.getDashboardMessageBus).toHaveBeenCalledTimes(1)
      expect(mockSetAuthToken).not.toHaveBeenCalled()
    })

    it('subscribes once the store reports a connection that landed after first render', () => {
      // Start with no host bus: the effect's attempt finds nothing and the provider renders
      // children bare. Then the host installs the bus and the store flips `connected`; the
      // state source drives the re-render that picks up the token.
      messageBus.client = undefined

      act(() => {
        renderProvider()
      })
      expect(mockSetAuthToken).not.toHaveBeenCalled()

      act(() => {
        messageBus.client = messageBus
        messageBus.setConnected(true)
      })

      expect(mockSetAuthToken).toHaveBeenCalledWith(expect.anything(), 'dashboard-token')
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
