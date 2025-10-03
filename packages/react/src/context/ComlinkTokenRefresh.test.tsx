import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {AuthStateType, getIsInDashboardState, setAuthToken} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useWindowConnection} from '../hooks/comlink/useWindowConnection'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {ComlinkTokenRefreshProvider} from './ComlinkTokenRefresh'

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

vi.mock('../hooks/context/useSanityInstance', () => ({
  useSanityInstance: vi.fn(),
}))

// Use simpler mock typings
const mockGetIsInDashboardState = getIsInDashboardState as Mock
const mockSetAuthToken = setAuthToken as Mock
const mockUseAuthState = useAuthState as Mock
const mockUseWindowConnection = useWindowConnection as Mock
const mockUseSanityInstance = useSanityInstance as Mock

const mockFetch = vi.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSanityInstance: any = {
  projectId: 'test',
  dataset: 'test',
  config: {studioMode: {enabled: false}},
}

describe('ComlinkTokenRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => false)})
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
    mockUseWindowConnection.mockReturnValue({fetch: mockFetch})
    mockUseSanityInstance.mockReturnValue(mockSanityInstance)
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
          <ComlinkTokenRefreshProvider>
            <div>Test</div>
          </ComlinkTokenRefreshProvider>,
        )

        mockUseAuthState.mockReturnValue({
          type: AuthStateType.ERROR,
          error: {statusCode: 401, message: 'Unauthorized'},
        })
        act(() => {
          rerender(
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>,
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
          <ComlinkTokenRefreshProvider>
            <div>Test</div>
          </ComlinkTokenRefreshProvider>,
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

        render(
          <ComlinkTokenRefreshProvider>
            <div>Test</div>
          </ComlinkTokenRefreshProvider>,
        )

        await act(async () => {
          await vi.advanceTimersByTimeAsync(100)
        })

        expect(mockSetAuthToken).toHaveBeenCalledWith(mockSanityInstance, 'new-token')
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })

      it('should not set auth token if received token is null when not in studio mode', async () => {
        mockUseAuthState.mockReturnValue({
          type: AuthStateType.ERROR,
          error: {statusCode: 401, message: 'Unauthorized'},
        })
        mockFetch.mockResolvedValueOnce({token: null})

        render(
          <ComlinkTokenRefreshProvider>
            <div>Test</div>
          </ComlinkTokenRefreshProvider>,
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
          <ComlinkTokenRefreshProvider>
            <div>Test</div>
          </ComlinkTokenRefreshProvider>,
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
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>,
          )

          mockUseAuthState.mockReturnValue({
            type: AuthStateType.ERROR,
            error: {statusCode: 500, message: 'Server Error'},
          })
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>,
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
            <ComlinkTokenRefreshProvider>
              <div>Test</div>
            </ComlinkTokenRefreshProvider>,
          )

          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_OUT})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>,
            )
          })

          expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/auth/tokens/create')
        })

        describe('when in studio mode', () => {
          beforeEach(() => {
            // Make the instance report studio mode enabled
            mockUseSanityInstance.mockReturnValue({
              ...mockSanityInstance,
              config: {studioMode: {enabled: true}},
            })
          })

          it('should not render DashboardTokenRefresh when studio mode enabled', () => {
            render(
              <ComlinkTokenRefreshProvider>
                <div>Test</div>
              </ComlinkTokenRefreshProvider>,
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
