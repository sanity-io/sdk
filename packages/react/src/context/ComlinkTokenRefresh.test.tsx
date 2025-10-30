import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {AuthStateType, getIsInDashboardState, setAuthToken} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useWindowConnection} from '../hooks/comlink/useWindowConnection'
import {ComlinkTokenRefreshProvider} from './ComlinkTokenRefresh'
import {ResourceProvider} from './ResourceProvider'

// Mocks
vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getIsInDashboardState: vi.fn(() => ({getCurrent: vi.fn()})),
    setAuthToken: vi.fn(),
  }
})

vi.mock('../hooks/auth/useAuthState', () => ({
  useAuthState: vi.fn(),
}))

vi.mock('../hooks/comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(),
}))

// Use simpler mock typings
const mockGetIsInDashboardState = getIsInDashboardState as Mock
const mockSetAuthToken = setAuthToken as Mock
const mockUseAuthState = useAuthState as Mock
const mockUseWindowConnection = useWindowConnection as Mock

const mockFetch = vi.fn()

describe('ComlinkTokenRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => false)})
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
    mockUseWindowConnection.mockReturnValue({fetch: mockFetch})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('ComlinkTokenRefreshProvider', () => {
    describe('when not in dashboard', () => {
      beforeEach(() => {
        mockGetIsInDashboardState.mockReturnValue({getCurrent: () => false})
      })

      it('should not request new token on 401 if not in dashboard', async () => {
        mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
        const {rerender} = render(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>
          </ResourceProvider>,
        )

        mockUseAuthState.mockReturnValue({
          type: AuthStateType.ERROR,
          error: {statusCode: 401, message: 'Unauthorized'},
        })
        act(() => {
          rerender(
            <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>
            </ResourceProvider>,
          )
        })

        await act(async () => {
          await vi.advanceTimersByTimeAsync(100)
        })
        expect(mockFetch).not.toHaveBeenCalled()
      })
    })

    describe('when in dashboard', () => {
      beforeEach(() => {
        mockGetIsInDashboardState.mockReturnValue({getCurrent: () => true})
      })

      it('should initialize useWindowConnection with correct parameters when not in studio mode', () => {
        // Simulate studio mode disabled by default
        render(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>
          </ResourceProvider>,
        )

        expect(mockUseWindowConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            name: SDK_NODE_NAME,
            connectTo: SDK_CHANNEL_NAME,
          }),
        )
      })

      it('should handle received token when not in studio mode', async () => {
        mockUseAuthState.mockReturnValue({
          type: AuthStateType.ERROR,
          error: {statusCode: 401, message: 'Unauthorized'},
        })
        mockFetch.mockResolvedValueOnce({token: 'new-token'})

        // Insert an Unauthorized error container that should be removed on success
        const errorContainer = document.createElement('div')
        errorContainer.id = '__sanityError'
        const child = document.createElement('div')
        child.textContent =
          'Uncaught error: Unauthorized - A valid session is required for this endpoint'
        errorContainer.appendChild(child)
        document.body.appendChild(errorContainer)

        render(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>
          </ResourceProvider>,
        )

        await act(async () => {
          await vi.advanceTimersByTimeAsync(100)
        })

        expect(mockSetAuthToken).toHaveBeenCalledWith(expect.any(Object), 'new-token')
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/auth/tokens/create')
        // Assert setAuthToken was called with instance matching provider config
        const instanceArg = mockSetAuthToken.mock.calls[0][0]
        expect(instanceArg.config).toEqual(
          expect.objectContaining({projectId: 'test-project', dataset: 'test-dataset'}),
        )
        // Unauthorized error container should be removed
        expect(document.getElementById('__sanityError')).toBeNull()
      })

      it('should not set auth token if received token is null when not in studio mode', async () => {
        mockUseAuthState.mockReturnValue({
          type: AuthStateType.ERROR,
          error: {statusCode: 401, message: 'Unauthorized'},
        })
        mockFetch.mockResolvedValueOnce({token: null})

        render(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>
          </ResourceProvider>,
        )

        await act(async () => {
          await vi.advanceTimersByTimeAsync(100)
        })

        expect(mockSetAuthToken).not.toHaveBeenCalled()
      })

      it('should handle fetch errors gracefully when not in studio mode', async () => {
        mockUseAuthState.mockReturnValue({
          type: AuthStateType.ERROR,
          error: {statusCode: 401, message: 'Unauthorized'},
        })
        mockFetch.mockRejectedValueOnce(new Error('Fetch failed'))

        render(
          <ResourceProvider projectId="test-project" dataset="test-dataset" fallback={null}>
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>
          </ResourceProvider>,
        )

        await act(async () => {
          await vi.advanceTimersByTimeAsync(100)
        })

        expect(mockFetch).toHaveBeenCalledTimes(1)
      })

      describe('Automatic token refresh', () => {
        it('should not request new token for non-401 errors when not in studio mode', async () => {
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = render(
            <ResourceProvider fallback={null}>
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>
              ,
            </ResourceProvider>,
          )

          mockUseAuthState.mockReturnValue({
            type: AuthStateType.ERROR,
            error: {statusCode: 500, message: 'Server Error'},
          })
          act(() => {
            rerender(
              <ResourceProvider fallback={null}>
                <ComlinkTokenRefreshProvider>
                  <div>Test</div>
                </ComlinkTokenRefreshProvider>
              </ResourceProvider>,
            )
          })

          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockFetch).not.toHaveBeenCalled()
        })

        it('should request new token on LOGGED_OUT state when not in studio mode', async () => {
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = render(
            <ResourceProvider fallback={null}>
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>
            </ResourceProvider>,
          )

          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_OUT})
          act(() => {
            rerender(
              <ResourceProvider fallback={null}>
                <ComlinkTokenRefreshProvider>
                  <div>Test</div>
                </ComlinkTokenRefreshProvider>
              </ResourceProvider>,
            )
          })

          expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/auth/tokens/create')
        })

        it('dedupes multiple 401 errors while a refresh is in progress', async () => {
          mockUseAuthState.mockReturnValue({
            type: AuthStateType.ERROR,
            error: {statusCode: 401, message: 'Unauthorized'},
          })
          // Return a promise we resolve later to keep in-progress true for a bit
          let resolveFetch: (v: {token: string | null}) => void
          mockFetch.mockImplementation(
            () =>
              new Promise<{token: string | null}>((resolve) => {
                resolveFetch = resolve
              }),
          )

          const {rerender} = render(
            <ResourceProvider fallback={null}>
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>
            </ResourceProvider>,
          )

          // Trigger a second 401 while the first request is still in progress
          mockUseAuthState.mockReturnValue({
            type: AuthStateType.ERROR,
            error: {statusCode: 401, message: 'Unauthorized again'},
          })
          act(() => {
            rerender(
              <ResourceProvider fallback={null}>
                <ComlinkTokenRefreshProvider>
                  <div>Test</div>
                </ComlinkTokenRefreshProvider>
              </ResourceProvider>,
            )
          })

          // Only one fetch should be in-flight
          expect(mockFetch).toHaveBeenCalledTimes(1)

          // Finish the first fetch
          await act(async () => {
            resolveFetch!({token: null})
          })
        })

        it('requests again after timeout if previous request did not resolve', async () => {
          mockUseAuthState.mockReturnValue({
            type: AuthStateType.ERROR,
            error: {statusCode: 401, message: 'Unauthorized'},
          })
          // First call never resolves
          mockFetch.mockImplementationOnce(() => new Promise(() => {}))

          const {rerender} = render(
            <ResourceProvider fallback={null}>
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>
            </ResourceProvider>,
          )

          expect(mockFetch).toHaveBeenCalledTimes(1)

          // After timeout elapses, a subsequent 401 should trigger another fetch
          await act(async () => {
            await vi.advanceTimersByTimeAsync(10000)
          })

          mockUseAuthState.mockReturnValue({
            type: AuthStateType.ERROR,
            error: {statusCode: 401, message: 'Unauthorized again'},
          })
          act(() => {
            rerender(
              <ResourceProvider fallback={null}>
                <ComlinkTokenRefreshProvider>
                  <div>Test</div>
                </ComlinkTokenRefreshProvider>
              </ResourceProvider>,
            )
          })

          expect(mockFetch).toHaveBeenCalledTimes(2)
        })

        describe('when in studio mode', () => {
          it('should not render DashboardTokenRefresh when studio mode enabled', () => {
            render(
              <ResourceProvider fallback={null} studioMode={{enabled: true}}>
                <ComlinkTokenRefreshProvider>
                  <div>Test</div>
                </ComlinkTokenRefreshProvider>
              </ResourceProvider>,
            )

            // In studio mode, provider should return children directly
            // So window connection should not be initialized
            expect(mockUseWindowConnection).not.toHaveBeenCalled()
          })
        })
      })
    })
  })
})
