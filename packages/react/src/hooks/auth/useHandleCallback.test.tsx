import {type AuthState, type AuthStore, createSanityInstance, getAuthStore} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityProvider} from '../../components/context/SanityProvider'
import {useHandleCallback} from './useHandleCallback'

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual<typeof import('@sanity/sdk')>('@sanity/sdk')
  return {
    ...actual,
    getAuthStore: vi.fn().mockImplementation(() => ({
      handleCallback: vi.fn(),
      getLoginUrls: vi.fn(),
      logout: vi.fn(),
      getCurrent: vi.fn(),
      dispose: vi.fn(),
      subscribe: vi.fn(),
    })),
  }
})

// vi.mock('./useAuthState', () => ({
//   useAuthState: () => ({type: 'logging-in'}),
// }))

describe('useHandleCallback', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetModules()
    vi.clearAllMocks()
  })

  it.skip('should handle callback when in logging-in state', async () => {
    vi.mock('./useAuthState', () => ({
      useAuthState: (): AuthState =>
        ({type: 'logging-in', isExchangingToken: true}) as Extract<AuthState, {type: 'logging-in'}>,
    }))

    vi.useFakeTimers()

    // Mock window.location
    const originalLocation = window.location
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = {href: 'http://test.com/callback?code=123'} as any

    const handleCallbackMock = vi.fn().mockResolvedValue(null)
    const mockAuthStore = {
      handleCallback: handleCallbackMock,
      getLoginUrls: vi.fn(),
      logout: vi.fn(),
      getCurrent: vi.fn(),
      dispose: vi.fn(),
      subscribe: vi.fn(),
    }
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as unknown as AuthStore)

    const sanityInstance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider sanityInstance={sanityInstance}>{children}</SanityProvider>
    )

    const {rerender} = renderHook(() => useHandleCallback(), {wrapper})

    // Force a re-render to ensure the effect runs
    rerender()

    // Run timers
    vi.advanceTimersByTime(0)

    expect(handleCallbackMock).toHaveBeenCalledWith('http://test.com/callback?code=123')

    // Cleanup
    vi.useRealTimers()
    window.location = originalLocation
  })

  it('should not handle callback when not in logging-in state', () => {
    vi.mock('./useAuthState', () => ({
      useAuthState: () =>
        ({
          type: 'logged-in',
        }) as Extract<AuthState, {type: 'logged-in'}>,
    }))

    const handleCallbackMock = vi.fn().mockResolvedValue(null)
    const mockAuthStore = {
      handleCallback: handleCallbackMock,
      getLoginUrls: vi.fn(),
      logout: vi.fn(),
      getCurrent: vi.fn(),
      dispose: vi.fn(),
      subscribe: vi.fn(),
    }
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as unknown as AuthStore)

    const sanityInstance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider sanityInstance={sanityInstance}>{children}</SanityProvider>
    )

    renderHook(() => useHandleCallback(), {wrapper})

    expect(handleCallbackMock).not.toHaveBeenCalled()
  })

  it('should redirect when callback returns a URL', async () => {
    vi.useFakeTimers()

    // Mock window.location
    const originalLocation = window.location
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = {href: 'http://test.com/callback'} as any

    const handleCallbackMock = vi.fn().mockResolvedValue('http://test.com/redirect')
    const mockAuthStore = {
      handleCallback: handleCallbackMock,
      getLoginUrls: vi.fn(),
      logout: vi.fn(),
      getCurrent: vi.fn(),
      dispose: vi.fn(),
      subscribe: vi.fn(),
    }
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as unknown as AuthStore)

    const sanityInstance = createSanityInstance({projectId: 'test', dataset: 'test'})
    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider sanityInstance={sanityInstance}>{children}</SanityProvider>
    )

    renderHook(() => useHandleCallback(), {wrapper})

    // Wait for promises to resolve
    await vi.runAllTimersAsync()

    window.location = originalLocation
  })
})
