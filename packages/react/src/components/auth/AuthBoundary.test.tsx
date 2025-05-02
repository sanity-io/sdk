import {AuthStateType} from '@sanity/sdk'
import {render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import {type FallbackProps} from 'react-error-boundary'
import {beforeEach, describe, expect, it, type MockInstance, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useAuthState} from '../../hooks/auth/useAuthState'
import * as utils from '../utils'
import {useVerifyOrgProjects} from '../../hooks/auth/useVerifyOrgProjects'
import {AuthBoundary} from './AuthBoundary'

// Mock hooks
vi.mock('../../hooks/auth/useAuthState', () => ({
  useAuthState: vi.fn(() => 'logged-out'),
}))
vi.mock('../../hooks/auth/useVerifyOrgProjects')
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

// Mock ErrorBoundary with a functional component and state simulation
vi.mock('react-error-boundary', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = await importOriginal<any>()

  // Functional mock that catches render errors
  class MockErrorBoundaryComponent extends React.Component<
    {
      children: React.ReactNode
      FallbackComponent?: React.ComponentType<FallbackProps>
      onError?: (error: Error, errorInfo: React.ErrorInfo) => void
      // Add any other props your actual ErrorBoundary might use
    },
    {error: Error | null}
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(props: any) {
      super(props)
      this.state = {error: null}
    }

    // Static methods don't use override
    static getDerivedStateFromError(error: Error) {
      // Update state so the next render will show the fallback UI.
      return {error}
    }

    override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
      // You can also log the error to an error reporting service
      this.props.onError?.(error, errorInfo)
    }

    override render() {
      if (this.state.error && this.props.FallbackComponent) {
        // You can render any custom fallback UI
        return (
          <this.props.FallbackComponent
            error={this.state.error}
            resetErrorBoundary={() => this.setState({error: null})}
          />
        )
      }
      if (this.state.error && !this.props.FallbackComponent) {
        return <div>Caught Error (No Fallback Provided)</div>
      }

      return this.props.children
    }
  }

  return {
    ...original,
    ErrorBoundary: MockErrorBoundaryComponent, // Use the class component mock
    useErrorHandler: vi.fn(),
  }
})

// Mock isInIframe
vi.mock('../utils', () => ({
  isInIframe: vi.fn(() => false),
}))

describe('AuthBoundary', () => {
  let consoleErrorSpy: MockInstance
  let originalLocation: Location
  const mockUseAuthState = vi.mocked(useAuthState)
  const mockUseVerifyOrgProjects = vi.mocked(useVerifyOrgProjects)
  const testProjectIds = ['proj-test'] // Example project ID for tests

  beforeEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Save original location and mock it
    originalLocation = window.location
    // @ts-expect-error - partial implementation
    delete window.location
    window.location = new URL('https://example.com') as unknown as Location
    // Default mocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN} as any)
    // Default mock for useVerifyOrgProjects - returns null (no error)
    mockUseVerifyOrgProjects.mockImplementation(() => null)
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
        <AuthBoundary projectIds={testProjectIds}>Protected Content</AuthBoundary>
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
        <AuthBoundary projectIds={testProjectIds}>Protected Content</AuthBoundary>
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
        <AuthBoundary projectIds={testProjectIds}>Protected Content</AuthBoundary>
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
        <AuthBoundary projectIds={testProjectIds}>Protected Content</AuthBoundary>
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

  it('renders children when logged in and org verification passes', () => {
    render(
      <ResourceProvider fallback={null}>
        <AuthBoundary projectIds={testProjectIds}>Protected Content</AuthBoundary>
      </ResourceProvider>,
    )
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('throws AuthError via AuthSwitch when org verification fails (verifyOrganization=true)', async () => {
    const orgErrorMessage = 'Organization mismatch!'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN} as any)
    // Mock specific return value for this test
    mockUseVerifyOrgProjects.mockImplementation((disabled, pIds) => {
      // Expect verification to be enabled (disabled=false) and projectIds to match
      if (!disabled && pIds === testProjectIds) {
        return orgErrorMessage
      }
      return null // Default case
    })

    // Need to catch the error thrown during render. ErrorBoundary mock handles this.
    render(
      <AuthBoundary verifyOrganization={true} projectIds={testProjectIds}>
        <div>Protected Content</div>
      </AuthBoundary>,
    )

    // The ErrorBoundary's FallbackComponent should be rendered
    // Check if the text rendered by the mocked LoginError component is present
    await waitFor(() => {
      // AuthSwitch throws ConfigurationError, ErrorBoundary catches and renders LoginErrorComponent mock
      // Check for title and description separately as rendered by LoginError
      expect(screen.getByText('Configuration Error')).toBeInTheDocument() // Check title
      expect(screen.getByText(orgErrorMessage)).toBeInTheDocument() // Check description (the error message)
    })
  })

  it('does NOT throw AuthError when org verification fails but verifyOrganization=false', () => {
    const orgErrorMessage = 'Organization mismatch!'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUseAuthState.mockReturnValue({type: AuthStateType.LOGGED_IN} as any)
    // Mock specific return value for this test
    mockUseVerifyOrgProjects.mockImplementation((disabled, pIds) => {
      // Expect verification to be disabled (disabled=true) and projectIds to match
      if (disabled && pIds === testProjectIds) {
        // Hook should return null when disabled, but we mock based on call
        return orgErrorMessage
      }
      return null // Default case
    })

    render(
      <AuthBoundary verifyOrganization={false} projectIds={testProjectIds}>
        <div>Protected Content</div>
      </AuthBoundary>,
    )

    // Should render children because verification is disabled
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    // Error fallback should not be rendered
    expect(screen.queryByText(/Login Error/)).not.toBeInTheDocument()
  })

  it('throws AuthError via AuthSwitch when auth state is ERROR', async () => {
    const authErrorMessage = 'Some authentication error'

    mockUseAuthState.mockReturnValue({
      type: AuthStateType.ERROR,
      error: new Error(authErrorMessage),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockUseVerifyOrgProjects.mockReturnValue(null) // Org verification passes or is irrelevant
    mockUseVerifyOrgProjects.mockImplementation(() => null)

    render(
      <AuthBoundary projectIds={testProjectIds}>
        <div>Protected Content</div>
      </AuthBoundary>,
    )

    await waitFor(() => {
      // AuthSwitch throws AuthError, ErrorBoundary catches and renders LoginErrorComponent mock
      // Check for the generic title and description rendered by LoginError for AuthError
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
      expect(
        screen.getByText('Please try again or contact support if the problem persists.'),
      ).toBeInTheDocument()
    })
  })

  // Add more tests for logged out state, redirects, etc.
})
