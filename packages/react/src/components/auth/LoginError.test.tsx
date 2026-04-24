import {ClientError} from '@sanity/client'
import {getIsInDashboardState} from '@sanity/sdk'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {AuthError} from './AuthError'
import {LoginError} from './LoginError'

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getIsInDashboardState: vi.fn(() => ({getCurrent: vi.fn(() => false)})),
  }
})

const mockLogout = vi.fn(async () => {})
vi.mock('../../hooks/auth/useLogOut', () => ({
  useLogOut: vi.fn(() => mockLogout),
}))

const mockWindowConnectionFetch = vi.fn()
vi.mock('../../hooks/comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(() => ({fetch: mockWindowConnectionFetch})),
}))

const mockGetIsInDashboardState = getIsInDashboardState as Mock

function makeClientError(statusCode: number, body: unknown): ClientError {
  return new ClientError({
    statusCode,
    headers: {},
    body,
    url: 'https://example.test',
    method: 'GET',
  } as ConstructorParameters<typeof ClientError>[0])
}

describe('LoginError', () => {
  beforeEach(() => {
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => false)})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows authentication error and retry button', async () => {
    const mockReset = vi.fn()
    const error = new AuthError(new Error('Test error'))

    render(
      <ResourceProvider fallback={null}>
        <LoginError error={error} resetErrorBoundary={mockReset} />
      </ResourceProvider>,
    )

    expect(screen.getByText('Authentication Error')).toBeInTheDocument()

    const retryButton = screen.getByRole('button', {name: 'Retry'})
    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalled()
    })
  })

  it('throws an error if the error is not an instance of AuthError', () => {
    const mockReset = vi.fn()
    const nonAuthError = new Error('Non-auth error')

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(
        <ResourceProvider fallback={null}>
          <LoginError error={nonAuthError} resetErrorBoundary={mockReset} />
        </ResourceProvider>,
      )
    }).toThrow('Non-auth error')

    consoleErrorSpy.mockRestore()
  })

  // In a standalone app (not embedded in the dashboard) the dashboard access
  // request path must not render, because useWindowConnection would suspend
  // waiting for a comlink node that never arrives.
  it('renders synchronously on a 401 projectUserNotFound error outside the dashboard', async () => {
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => false)})

    const error = makeClientError(401, {
      error: {
        type: 'projectUserNotFoundError',
        description: 'User is not a member of this project.',
      },
    })

    render(
      <ResourceProvider fallback={<div>SUSPENDED</div>}>
        <LoginError error={error} resetErrorBoundary={vi.fn()} />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('User is not a member of this project.')).toBeInTheDocument()
    })
    // ClientError must render under the "Authentication Error" heading; it is
    // not a ConfigurationError.
    expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    expect(screen.queryByText('Configuration Error')).not.toBeInTheDocument()
    expect(screen.queryByText('SUSPENDED')).not.toBeInTheDocument()
    expect(mockWindowConnectionFetch).not.toHaveBeenCalled()
  })

  it('fires the dashboard access request on a 401 projectUserNotFound error inside the dashboard', async () => {
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => true)})

    const error = makeClientError(401, {
      error: {
        type: 'projectUserNotFoundError',
        description: 'User is not a member of this project.',
      },
    })

    render(
      <ResourceProvider projectId="abc123" dataset="production" fallback={<div>SUSPENDED</div>}>
        <LoginError error={error} resetErrorBoundary={vi.fn()} />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(mockWindowConnectionFetch).toHaveBeenCalledWith('dashboard/v1/auth/access/request', {
        resourceType: 'project',
        resourceId: 'abc123',
      })
    })
  })

  // Mirrors the real production chain: AuthBoundary wraps the ClientError in
  // an AuthError before the error boundary hands it to LoginError. The
  // `.cause` unwrap is what makes the dashboard access request path reachable
  // at runtime (without it, the previous `error instanceof ClientError` check
  // was dead code in the dashboard).
  it('fires the dashboard access request when the projectUserNotFound ClientError is wrapped in an AuthError', async () => {
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => true)})

    const clientError = makeClientError(401, {
      error: {
        type: 'projectUserNotFoundError',
        description: 'User is not a member of this project.',
      },
    })
    const error = new AuthError(clientError)
    const mockReset = vi.fn()

    render(
      <ResourceProvider projectId="abc123" dataset="production" fallback={<div>SUSPENDED</div>}>
        <LoginError error={error} resetErrorBoundary={mockReset} />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(mockWindowConnectionFetch).toHaveBeenCalledWith('dashboard/v1/auth/access/request', {
        resourceType: 'project',
        resourceId: 'abc123',
      })
    })

    expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    expect(screen.getByText('User is not a member of this project.')).toBeInTheDocument()
    // projectUserNotFound intentionally hides the Retry CTA: the user can't
    // fix it by retrying, only by getting access granted through the
    // dashboard access request flow above.
    expect(screen.queryByRole('button', {name: 'Retry'})).not.toBeInTheDocument()
    // Dashboard flow must never auto-log-out; ComlinkTokenRefreshProvider is
    // responsible for any token mutation, not LoginError.
    expect(mockLogout).not.toHaveBeenCalled()
    expect(mockReset).not.toHaveBeenCalled()
  })

  // In a standalone app, an invalid-token 401 (anything other than
  // `projectUserNotFoundError`) should silently log the user out so that
  // AuthBoundary's LOGGED_OUT effect redirects to the Sanity login URL.
  // AuthBoundary wraps the real ClientError in an AuthError before it reaches
  // the error boundary, so the component must unwrap `.cause` to see it.
  it('auto-logs-out on a non-projectUserNotFound 401 outside the dashboard', async () => {
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => false)})

    const mockReset = vi.fn()
    const clientError = makeClientError(401, {
      error: {type: 'someOther401Type', description: 'Token is invalid'},
    })
    const error = new AuthError(clientError)

    render(
      <ResourceProvider fallback={null}>
        <LoginError error={error} resetErrorBoundary={mockReset} />
      </ResourceProvider>,
    )

    expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    expect(await screen.findByText('Signing you out and returning to login...')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalled()
    })
  })

  // In the dashboard we must not auto-log-out on a generic 401.
  // ComlinkTokenRefreshProvider is responsible for asking the parent window
  // for a fresh token; the Retry button stays as a manual fallback.
  it('does not auto-log-out on a non-projectUserNotFound 401 inside the dashboard', async () => {
    mockGetIsInDashboardState.mockReturnValue({getCurrent: vi.fn(() => true)})

    const mockReset = vi.fn()
    const clientError = makeClientError(401, {
      error: {type: 'someOther401Type', description: 'Token is invalid'},
    })
    const error = new AuthError(clientError)

    render(
      <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
        <LoginError error={error} resetErrorBoundary={mockReset} />
      </ResourceProvider>,
    )

    expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    expect(
      screen.getByText('Please try again or contact support if the problem persists.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Retry'})).toBeInTheDocument()
    expect(mockLogout).not.toHaveBeenCalled()
    expect(mockReset).not.toHaveBeenCalled()
    // Generic 401s should not trigger the dashboard access request flow.
    expect(mockWindowConnectionFetch).not.toHaveBeenCalled()
  })
})
