import {AuthStateType, getIsInDashboardState, setAuthToken} from '@sanity/sdk'
import {act, render, waitFor} from '@testing-library/react'
import React from 'react'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useWindowConnection} from '../hooks/comlink/useWindowConnection'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {
  type ComlinkTokenRefreshConfig,
  ComlinkTokenRefreshProvider,
  useComlinkTokenRefresh,
} from './ComlinkTokenRefresh'

// Mocks
vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getIsInDashboardState: vi.fn(() => ({getCurrent: vi.fn()})),
    setAuthToken: vi.fn(),
  }
})

vi.mock('../hooks/auth/useAuthState')
vi.mock('../hooks/comlink/useWindowConnection')
vi.mock('../hooks/context/useSanityInstance')

// Use simpler mock typings
const mockGetIsInDashboardState = getIsInDashboardState as Mock
const mockSetAuthToken = setAuthToken as Mock
const mockUseAuthState = useAuthState as Mock
const mockUseWindowConnection = useWindowConnection as Mock
const mockUseSanityInstance = useSanityInstance as Mock

const mockSendMessage = vi.fn()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSanityInstance: any = {projectId: 'test', dataset: 'test'}

// Variable to capture the hook's current value for direct assertions
let currentHookValue: ReturnType<typeof useComlinkTokenRefresh>

describe('ComlinkTokenRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => false)})
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
    mockUseWindowConnection.mockReturnValue({sendMessage: mockSendMessage, connection: undefined})
    mockUseSanityInstance.mockReturnValue(mockSanityInstance)
    vi.spyOn(console, 'warn').mockImplementation(() => {}) // Mock console.warn
    // Initialize currentHookValue with default structure
    currentHookValue = {
      requestNewToken: () => {},
      isTokenRefreshInProgress: {current: false},
      comlinkStatus: 'idle',
      isEnabled: false,
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
        <span data-testid="is-enabled">{String(hookValue.isEnabled)}</span>
        <span data-testid="comlink-status">{hookValue.comlinkStatus}</span>
        <span data-testid="is-in-progress">
          {String(hookValue.isTokenRefreshInProgress.current)}
        </span>
        <button onClick={hookValue.requestNewToken}>Request Token</button>
      </div>
    )
  }

  const renderWithProvider = (
    props?: ComlinkTokenRefreshConfig,
    testComponentProps?: TestComponentProps,
    children?: React.ReactNode, // Allow custom children as before
  ) => {
    const onHookUpdateCallback =
      testComponentProps?.onHookUpdate ||
      ((value) => {
        currentHookValue = value
      })
    return render(
      <ComlinkTokenRefreshProvider {...props}>
        {children || <TestComponent onHookUpdate={onHookUpdateCallback} />}
      </ComlinkTokenRefreshProvider>,
    )
  }

  describe('useComlinkTokenRefresh without Provider', () => {
    it('should return default values and warn on requestNewToken', () => {
      // Render TestComponent directly without ComlinkTokenRefreshProvider
      const {getByText, getByTestId} = render(
        <TestComponent onHookUpdate={(value) => (currentHookValue = value)} />,
      )

      expect(currentHookValue.isEnabled).toBe(false)
      expect(currentHookValue.comlinkStatus).toBe('idle')
      expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)

      expect(getByTestId('is-enabled').textContent).toBe('false')
      expect(getByTestId('comlink-status').textContent).toBe('idle')
      expect(getByTestId('is-in-progress').textContent).toBe('false')

      act(() => {
        getByText('Request Token').click()
      })

      // eslint-disable-next-line no-console
      expect(console.warn).toHaveBeenCalledWith(
        'useComlinkTokenRefresh must be used within a ComlinkTokenRefreshProvider with the feature enabled.',
      )
      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('ComlinkTokenRefreshProvider', () => {
    it('should provide default context values when disabled', () => {
      renderWithProvider({enabled: false})
      expect(currentHookValue.isEnabled).toBe(false)
      expect(currentHookValue.comlinkStatus).toBe('idle')
      expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
    })

    it('requestNewToken should do nothing and not warn if disabled', () => {
      const {getByText} = renderWithProvider({enabled: false})
      act(() => {
        getByText('Request Token').click()
      })
      expect(mockSendMessage).not.toHaveBeenCalled()
      // eslint-disable-next-line no-console
      expect(console.warn).not.toHaveBeenCalled()
      expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
    })

    it('should provide enabled as true from context when enabled prop is true', () => {
      renderWithProvider({enabled: true})
      expect(currentHookValue.isEnabled).toBe(true)
    })

    describe('when enabled and not in dashboard', () => {
      beforeEach(() => {
        mockGetIsInDashboardState.mockReturnValue({getCurrent: () => false})
      })

      it('should have comlinkStatus idle and requestNewToken should do nothing', () => {
        const {getByText} = renderWithProvider({enabled: true})
        expect(currentHookValue.isEnabled).toBe(true)
        expect(currentHookValue.comlinkStatus).toBe('idle')

        act(() => {
          getByText('Request Token').click()
        })
        expect(mockSendMessage).not.toHaveBeenCalled()
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })
    })

    describe('when enabled and in dashboard', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const comlinkCallbacks: any = {}

      beforeEach(() => {
        mockGetIsInDashboardState.mockReturnValue({getCurrent: () => true})
        // Capture the onMessage and onStatus callbacks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockUseWindowConnection.mockImplementation((options: any) => {
          // Fix: Safely access options properties
          if (options && options.onMessage) comlinkCallbacks.onMessage = options.onMessage
          if (options && options.onStatus) comlinkCallbacks.onStatus = options.onStatus
          return {sendMessage: mockSendMessage, connection: undefined}
        })
      })

      it('should initialize useWindowConnection with correct parameters and allow comlink status update', () => {
        renderWithProvider({
          enabled: true,
          comlinkName: 'test-sdk',
          parentName: 'test-parent',
        })

        expect(mockUseWindowConnection).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'test-sdk',
            connectTo: 'test-parent',
          }),
        )

        act(() => {
          comlinkCallbacks.onStatus?.('connected')
        })
        expect(currentHookValue.comlinkStatus).toBe('connected')
      })

      it('requestNewToken should do nothing if comlinkStatus is not "connected"', () => {
        renderWithProvider({enabled: true})
        act(() => {
          comlinkCallbacks.onStatus?.('connecting')
        })
        expect(currentHookValue.comlinkStatus).toBe('connecting')

        act(() => {
          currentHookValue.requestNewToken() // Call directly for this check
        })
        expect(mockSendMessage).not.toHaveBeenCalled()
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('requestNewToken should do nothing if token refresh is already in progress', () => {
        const {getByText} = renderWithProvider({enabled: true})
        act(() => {
          comlinkCallbacks.onStatus?.('connected')
        })
        expect(currentHookValue.comlinkStatus).toBe('connected')

        // Start a request
        act(() => {
          getByText('Request Token').click()
        })
        expect(mockSendMessage).toHaveBeenCalledTimes(1)
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        // Try to start another one
        act(() => {
          getByText('Request Token').click()
        })
        expect(mockSendMessage).toHaveBeenCalledTimes(1) // Still 1
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        act(() => {
          vi.advanceTimersByTime(15000) // Default timeout
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('requestNewToken should send message and set inProgress, then timeout', async () => {
        const responseTimeout = 5000
        const {getByText} = renderWithProvider({enabled: true, responseTimeout})
        act(() => {
          comlinkCallbacks.onStatus?.('connected')
        })

        act(() => {
          getByText('Request Token').click()
        })

        expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/auth/tokens/create')
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        act(() => {
          vi.advanceTimersByTime(responseTimeout - 1)
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('should handle received token and reset inProgress', () => {
        const {getByText} = renderWithProvider({enabled: true})
        act(() => {
          comlinkCallbacks.onStatus?.('connected')
        })

        act(() => {
          getByText('Request Token').click()
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
        expect(mockSendMessage).toHaveBeenCalledTimes(1)

        act(() => {
          comlinkCallbacks.onMessage['dashboard/v1/auth/tokens/create']({token: 'new-token'})
        })

        expect(mockSetAuthToken).toHaveBeenCalledWith(mockSanityInstance, 'new-token')
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        // Ensure timeout was cleared (check by advancing time - progress should still be false)
        act(() => {
          vi.advanceTimersByTime(15000) // Default timeout
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('should not set auth token if received token is null', () => {
        renderWithProvider({enabled: true})
        act(() => {
          comlinkCallbacks.onStatus?.('connected')
        })
        act(() => {
          currentHookValue.requestNewToken()
        })
        act(() => {
          comlinkCallbacks.onMessage['dashboard/v1/auth/tokens/create']({token: null})
        })
        expect(mockSetAuthToken).not.toHaveBeenCalled()
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
      })

      it('should reset inProgress if sendMessage throws', () => {
        mockSendMessage.mockImplementationOnce(() => {
          throw new Error('Send failed')
        })
        renderWithProvider({enabled: true})
        act(() => {
          comlinkCallbacks.onStatus?.('connected')
        })
        act(() => {
          currentHookValue.requestNewToken()
        })
        expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        expect(mockSendMessage).toHaveBeenCalledTimes(1)
      })

      describe('Automatic token refresh on 401', () => {
        const createError401 = () => ({statusCode: 401, message: 'Unauthorized'})

        it.skip('should request new token on 401 error if not already in progress', async () => {
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider({enabled: true})

          act(() => {
            comlinkCallbacks.onStatus?.('connected')
          })
          expect(currentHookValue.comlinkStatus).toBe('connected')

          currentHookValue.isTokenRefreshInProgress.current = false
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: createError401()})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          await waitFor(
            () => {
              expect(mockSendMessage).toHaveBeenCalledWith('dashboard/v1/auth/tokens/create')
            },
            {timeout: 10000},
          )
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
        }, 10000)

        it('should not request new token on 401 if refresh is already in progress', async () => {
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender, getByText} = renderWithProvider({enabled: true})
          act(() => {
            comlinkCallbacks.onStatus?.('connected')
          })

          act(() => {
            getByText('Request Token').click()
          })
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
          mockSendMessage.mockClear()

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: createError401()})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockSendMessage).not.toHaveBeenCalled()
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
        }, 10000)

        it('should not request new token on 401 if not in dashboard', async () => {
          mockGetIsInDashboardState.mockReturnValue({getCurrent: () => false})
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider({enabled: true})

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: createError401()})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockSendMessage).not.toHaveBeenCalled()
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        }, 10000)

        it('should not request new token for non-401 errors', async () => {
          const error500 = {statusCode: 500, message: 'Server Error'}
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider({enabled: true})
          act(() => {
            comlinkCallbacks.onStatus?.('connected')
          })

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: error500})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })

          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockSendMessage).not.toHaveBeenCalled()
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false)
        }, 10000)

        it.skip('should not process the same 401 error instance multiple times', async () => {
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider({enabled: true})
          act(() => {
            comlinkCallbacks.onStatus?.('connected')
          })

          const firstErrorInstance = createError401()
          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: firstErrorInstance})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })
          await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1), {timeout: 10000})
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: firstErrorInstance})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })
          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })
          expect(mockSendMessage).toHaveBeenCalledTimes(1)

          act(() => {
            vi.advanceTimersByTime(15000)
          })
          await waitFor(
            () => expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false),
            {timeout: 10000},
          )
          mockSendMessage.mockClear()

          const newErrorInstance = createError401()
          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: newErrorInstance})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })
          await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1), {timeout: 10000})
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
        }, 20000)

        it.skip('should reset processed error ref if auth state changes to non-error or different error', async () => {
          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          const {rerender} = renderWithProvider({enabled: true})
          act(() => {
            comlinkCallbacks.onStatus?.('connected')
          })

          const firstError = createError401()
          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: firstError})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })
          await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1), {timeout: 10000})
          act(() => {
            vi.advanceTimersByTime(15000)
          })
          await waitFor(
            () => expect(currentHookValue.isTokenRefreshInProgress.current).toBe(false),
            {timeout: 10000},
          )
          mockSendMessage.mockClear()

          mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })
          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })

          mockUseAuthState.mockReturnValue({type: AuthStateType.ERROR, error: createError401()})
          act(() => {
            rerender(
              <ComlinkTokenRefreshProvider enabled={true}>
                <TestComponent />
              </ComlinkTokenRefreshProvider>,
            )
          })
          await waitFor(() => expect(mockSendMessage).toHaveBeenCalledTimes(1), {timeout: 10000})
          expect(currentHookValue.isTokenRefreshInProgress.current).toBe(true)
        }, 25000)
      })
    })
  })
})
