import {type AuthStore, getAuthStore} from '@sanity/sdk'
import {renderHook} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {SanityProvider} from '../../components/context/SanityProvider'
import {useHandleCallback} from './useHandleCallback'

vi.mock(import('@sanity/sdk'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getAuthStore: vi.fn(),
  }
})

vi.mock('./useAuthState', () => ({
  useAuthState: () => 'logging-in',
}))

describe('useHandleCallback', () => {
  it('should handle callback when in logging-in state', () => {
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
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as AuthStore)

    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider config={{projectId: 'test', dataset: 'test'}}>{children}</SanityProvider>
    )

    renderHook(() => useHandleCallback(), {wrapper})

    expect(handleCallbackMock).toHaveBeenCalledWith('http://test.com/callback?code=123')

    // Restore window.location
    window.location = originalLocation
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
    vi.mocked(getAuthStore).mockReturnValue(mockAuthStore as AuthStore)

    const wrapper = ({children}: {children: React.ReactNode}) => (
      <SanityProvider config={{projectId: 'test', dataset: 'test'}}>{children}</SanityProvider>
    )

    renderHook(() => useHandleCallback(), {wrapper})

    // Wait for promises to resolve
    await vi.runAllTimersAsync()

    expect(window.location.href).toBe('http://test.com/redirect')

    // Restore window.location
    window.location = originalLocation
  })
})
