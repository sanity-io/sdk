import {AuthStateType} from '@sanity/sdk'
import {render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, type MockInstance, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useAuthState} from '../../hooks/auth/useAuthState'
import * as utils from '../utils'
import {AuthBoundary} from './AuthBoundary'

// Mock hooks
vi.mock('../../hooks/auth/useAuthState', () => ({
  useAuthState: vi.fn(() => 'logged-out'),
}))
vi.mock('../../hooks/auth/useLoginUrls', () => ({
  useLoginUrls: vi.fn(() => [{title: 'Provider A', url: 'https://provider-a.com/auth'}]),
}))
vi.mock('../../hooks/auth/useHandleAuthCallback', () => ({
  useHandleAuthCallback: vi.fn(() => async () => {}),
}))
vi.mock('../../hooks/auth/useLogOut', () => ({
  useLogOut: vi.fn(() => async () => {}),
}))
vi.mock('../../hooks/auth/useLoginUrl', () => ({
  useLoginUrl: vi.fn(() => 'https://sanity.io/login'),
}))

// Mock AuthError throwing scenario
vi.mock('./AuthError', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./AuthError')>()
  return {
    ...actual,
    AuthError: class MockAuthError extends Error {
      constructor(error: Error) {
        super(error.message)
        this.name = 'AuthError'
        this.cause = error
      }
    },
  }
})

describe('AuthBoundary', () => {
  let consoleErrorSpy: MockInstance
  let originalLocation: Location

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Save original location and mock it
    originalLocation = window.location
    // @ts-expect-error - partial implementation
    delete window.location
    window.location = new URL('https://example.com') as unknown as Location
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
    // Restore original location
    window.location = originalLocation
    vi.restoreAllMocks()
  })

  describe('bridge script loading', () => {
    it('does not load bridge script when not in iframe', async () => {
      // Reset modules to ensure a fresh module environment
      vi.resetModules()

      // Mock document methods
      const appendChildSpy = vi.spyOn(document.head, 'appendChild')

      // Mock conditions to prevent script loading
      vi.spyOn(utils, 'isInIframe').mockReturnValue(false)

      // Import the module to trigger the code
      await import('./AuthBoundary')

      // Verify no script was added
      expect(appendChildSpy).not.toHaveBeenCalled()
    })

    it('does not load bridge script when core script is already loaded', async () => {
      // Reset modules to ensure a fresh module environment
      vi.resetModules()

      // Mock document methods
      const appendChildSpy = vi.spyOn(document.head, 'appendChild')

      // Mock conditions to prevent script loading (in iframe but script already loaded)
      vi.spyOn(utils, 'isInIframe').mockReturnValue(true)
      vi.spyOn(document, 'querySelector').mockReturnValue(document.createElement('div'))

      // Import the module to trigger the code
      await import('./AuthBoundary')

      // Verify no script was added
      expect(appendChildSpy).not.toHaveBeenCalled()
    })
  })

  it('redirects to the sanity.io/login url when authState="logged-out" and not in iframe', async () => {
    // Mock isInIframe to return false
    vi.spyOn(utils, 'isInIframe').mockReturnValue(false)

    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    })

    render(
      <ResourceProvider fallback={null}>
        <AuthBoundary>Protected Content</AuthBoundary>
      </ResourceProvider>,
    )

    // Wait for the redirect to happen
    await waitFor(() => {
      expect(window.location.href).toBe('https://sanity.io/login')
    })
  })

  it('does not redirect when authState="logged-out" and in iframe', async () => {
    // Mock isInIframe to return true
    vi.spyOn(utils, 'isInIframe').mockReturnValue(true)

    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    })

    const {container} = render(
      <ResourceProvider fallback={null}>
        <AuthBoundary>Protected Content</AuthBoundary>
      </ResourceProvider>,
    )

    // Ensure no redirect happened
    expect(window.location.href).toBe('https://example.com/')
    // Should render null for logged-out state
    expect(container.innerHTML).toBe('')
  })

  it('renders the empty LoginCallback component when authState="logging-in"', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGING_IN,
      isExchangingToken: false,
    })
    const {container} = render(
      <ResourceProvider fallback={null}>
        <AuthBoundary>Protected Content</AuthBoundary>
      </ResourceProvider>,
    )

    // The callback screen renders null check that it renders nothing
    expect(container.innerHTML).toBe('')
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders children when authState="logged-in"', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGED_IN,
      currentUser: null,
      token: 'exampleToken',
    })
    render(
      <ResourceProvider fallback={null}>
        <AuthBoundary>Protected Content</AuthBoundary>
      </ResourceProvider>,
    )

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('shows the LoginError (via ErrorBoundary) when authState="error"', async () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.ERROR,
      error: new Error('test error'),
    })
    render(
      <ResourceProvider fallback={null}>
        <AuthBoundary>Protected Content</AuthBoundary>
      </ResourceProvider>,
    )

    // The AuthBoundary should throw an AuthError internally
    // and then display the LoginError component as the fallback.
    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
      expect(
        screen.getByText('Please try again or contact support if the problem persists.'),
      ).toBeInTheDocument()
    })
  })

  it('throws error for invalid auth state', () => {
    // Create a mock with an invalid auth state type that will trigger the default case
    vi.mocked(useAuthState).mockReturnValue({
      // @ts-expect-error - intentionally creating an invalid state to test error handling
      type: 'INVALID_STATE',
    })

    // Capture and verify the error
    expect(() => {
      render(
        <ResourceProvider fallback={null}>
          <AuthBoundary>Protected Content</AuthBoundary>
        </ResourceProvider>,
      )
    }).toThrow('Invalid auth state: INVALID_STATE')
  })
})
