import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {AuthStateType, getIsInDashboardState, setAuthToken} from '@sanity/sdk'
import {act, render} from '@testing-library/react'
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useWindowConnection} from '../hooks/comlink/useWindowConnection'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {ComlinkTokenRefreshProvider, useComlinkTokenRefresh} from './ComlinkTokenRefresh'

const DEFAULT_RESPONSE_TIMEOUT = 10000 // 10 seconds

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
const mockSanityInstance: any = {projectId: 'test', dataset: 'test'}

// Variable to capture the hook's current value for direct assertions
let currentHookValue: ReturnType<typeof useComlinkTokenRefresh>

describe('ComlinkTokenRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => false)})
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
    mockUseWindowConnection.mockReturnValue({fetch: mockFetch})
    mockUseSanityInstance.mockReturnValue(mockSanityInstance)
    vi.spyOn(console, 'warn').mockImplementation(() => {}) // Mock console.warn
    // Initialize currentHookValue with default structure
    currentHookValue = {
      requestNewToken: () => {},
      isTokenRefreshInProgress: {current: false},
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  interface TestComponentProps {
    onHookUpdate?: (value: ReturnType<typeof useComlinkTokenRefresh>) => void
  }

  const TestComponent: React.FC<TestComponentProps> = ({onHookUpdate}) => {
    const hookValue = useComlinkTokenRefresh()
    React.useEffect(() => {
      onHookUpdate?.(hookValue)
    }, [hookValue, onHookUpdate]) // Update when hookValue or callback changes

    return (
      <div>
        <span data-testid="is-in-progress">
          {String(hookValue.isTokenRefreshInProgress.current)}
        </span>
        <button onClick={hookValue.requestNewToken}>Request Token</button>
      </div>
    )
  }

  const renderWithProvider = (
    testComponentProps?: TestComponentProps,
    children?: React.ReactNode,
  ) => {
    const onHookUpdateCallback =
      testComponentProps?.onHookUpdate ||
      ((value) => {
        currentHookValue = value
      })
    return render(
      <ComlinkTokenRefreshProvider>
        {children || <TestComponent onHookUpdate={onHookUpdateCallback} />}
      </ComlinkTokenRefreshProvider>,
    )
  }

  describe('useComlinkTokenRefresh without Provider', () => {
    it('should return default values and warn on requestNewToken', () => {
      const {getByText} = render(
        <TestComponent onHookUpdate={(value) => (currentHookValue = value)} />,
      )

      expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)

      act(() => {
        getByText('Request Token').click()
      })

      // Verify warning was shown
      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        'useComlinkTokenRefresh must be used within a ComlinkTokenRefreshProvider.',
      )
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('ComlinkTokenRefreshProvider', () => {
    describe('when not in dashboard', () => {
      beforeEach(() => {
        mockGetIsInDashboardState.mockReturnValue({getCurrent: () => false})
      })

      it('should have requestNewToken do nothing', () => {
        const {getByText} = renderWithProvider()

        act(() => {
          getByText('Request Token').click()
        })
        expect(mockFetch).not.toHaveBeenCalled()
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })
    })

    describe('when in dashboard', () => {
      beforeEach(() => {
        mockGetIsInDashboardState.mockReturnValue({getCurrent: () => true})
      })

      it('should initialize useWindowConnection with correct parameters', () => {
        renderWithProvider()

        expect(mockUseWindowConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            name: SDK_NODE_NAME,
            connectTo: SDK_CHANNEL_NAME,
          }),
        )
      })

      it('requestNewToken should do nothing if token refresh is already in progress', async () => {
        // Use a promise that never resolves to keep the refresh in progress
        mockFetch.mockImplementationOnce(() => new Promise(() => {}))
        const {getByText} = renderWithProvider()

        // Start a request
        await act(async () => {
          getByText('Request Token').click()
        })
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        // Try to start another one
        await act(async () => {
          getByText('Request Token').click()
        })
        expect(mockFetch).toHaveBeenCalledTimes(1) // Still 1
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        act(() => {
          vi.advanceTimersByTime(DEFAULT_RESPONSE_TIMEOUT + 1000)
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('requestNewToken should fetch token and set inProgress, then timeout if no response', async () => {
        mockFetch.mockImplementationOnce(() => new Promise(() => {})) // Never resolves
        const {getByText} = renderWithProvider()

        await act(async () => {
          getByText('Request Token').click()
        })

        expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/auth/tokens/create')
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        act(() => {
          vi.advanceTimersByTime(DEFAULT_RESPONSE_TIMEOUT - 1)
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('should handle received token and reset inProgress', async () => {
        mockFetch.mockResolvedValueOnce({token: 'new-token'})
        const {getByText} = renderWithProvider()

        await act(async () => {
          getByText('Request Token').click()
        })

        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        expect(mockSetAuthToken).toHaveBeenCalledWith(mockSanityInstance, 'new-token')
        expect(mockFetch).toHaveBeenCalledTimes(1)

        // Ensure timeout was cleared (check by advancing time - progress should still be false)
        act(() => {
          vi.advanceTimersByTime(DEFAULT_RESPONSE_TIMEOUT + 1000)
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('should not set auth token if received token is null', async () => {
        mockFetch.mockResolvedValueOnce({token: null})
        renderWithProvider()

        await act(async () => {
          currentHookValue.requestNewToken()
        })

        expect(mockSetAuthToken).not.toHaveBeenCalled()
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('should reset inProgress if fetch throws', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Fetch failed'))
        renderWithProvider()

        await act(async () => {
          currentHookValue.requestNewToken()
        })

        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        expect(mockFetch).toHaveBeenCalledTimes(1)
      })

      describe('Automatic token refresh on 401', () => {
        const createError401 = () => ({statusCode: 401, message: 'Unauthorized'})

        it('should not request new token on 401 if refresh is already in progress', async () => {
          mockFetch.mockImplementationOnce(() => new Promise(() => {})) // Never resolves
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender, getByText} = renderWithProvider()

          await act(async () => {
            getByText('Request Token').click()
          })
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
          mockFetch.mockClear()

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: createError401()})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockFetch).not.toHaveBeenCalled()
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
        })

        it('should not request new token on 401 if not in dashboard', async () => {
          mockGetIsInDashboardState.mockReturnValue({getCurrent: () => false})
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider()

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: createError401()})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockFetch).not.toHaveBeenCalled()
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        })

        it('should not request new token for non-401 errors', async () => {
          const error500 = {statusCode: 500, message: 'Server Error'}
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider()

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: error500})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockFetch).not.toHaveBeenCalled()
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        })

        it('should request new token on LOGGED_OUT state', async () => {
          // Use a promise that never resolves to keep the refresh in progress
          mockFetch.mockImplementationOnce(() => new Promise(() => {}))
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider()

          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_OUT})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          expect(mockFetch).toHaveBeenCalledWith('dashboard/v1/auth/tokens/create')
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
        })
      })
    })
  })
})
