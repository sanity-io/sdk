import {AuthStateType} from '@sanity/sdk'
import {render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, type MockInstance, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useAuthState} from '../../hooks/auth/useAuthState'
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
  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy?.mockRestore()
  })

  it('renders the Login component when authState="logged-out"', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    })
    render(<AuthBoundary>Protected Content</AuthBoundary>)

    // The login screen should show "Choose login provider" by default
    expect(screen.getByText('Choose login provider')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders the LoginCallback component when authState="logging-in"', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGING_IN,
      isExchangingToken: false,
    })
    render(
      <ResourceProvider fallback={null}>
        <AuthBoundary>Protected Content</AuthBoundary>
      </ResourceProvider>,
    )

    // The callback screen shows "Logging you in…"
    expect(screen.getByText('Logging you in…')).toBeInTheDocument()
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
})
