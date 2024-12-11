// ALL MOCKS MUST GO BEFORE ANY IMPORTS 😤
vi.mock('../context/useSanityInstance', () => ({
  useSanityInstance: () => ({
    projectId: 'test',
    dataset: 'test',
  }),
}))

vi.mock('./useAuthState', () => ({
  useAuthState: vi.fn().mockReturnValue({
    type: 'logging-in',
    isExchangingToken: true,
  }),
}))

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

// IMPORTS COME AFTER ALL MOCKS
import {type AuthState, type AuthStore, createSanityInstance, getAuthStore} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityProvider} from '../../components/context/SanityProvider'
import {useAuthState} from './useAuthState'
import {useHandleCallback} from './useHandleCallback'

describe('useHandleCallback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.mocked(useAuthState).mockReturnValue({
      type: 'logging-in',
      isExchangingToken: true,
    } as Extract<AuthState, {type: 'logging-in'}>)
  })

  it('should handle callback when in logging-in state', async () => {
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

    await vi.runAllTimersAsync()

    expect(handleCallbackMock).toHaveBeenCalledWith('http://test.com/callback?code=123')

    // Cleanup
    vi.useRealTimers()
    window.location = originalLocation
  })

  it('should not handle callback when not in logging-in state', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: 'logged-in',
      token: 'test-token',
      currentUser: null,
    } as Extract<AuthState, {type: 'logged-in'}>)

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
