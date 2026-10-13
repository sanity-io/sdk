import {ClientError} from '@sanity/client'
import {type CurrentUser, getProjectAccessErrorProjectId} from '@sanity/sdk'
import {installMessageBus, isDashboardEnvironment, resetMessageBus} from '@sanity/sdk/_internal'
import {type MessageBusHost, type PayloadOf} from '@sanity/sdk/dashboard'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {AuthError} from './AuthError'
import {LoginError} from './LoginError'

vi.mock('@sanity/sdk/_internal', async () => {
  const actual = await vi.importActual('@sanity/sdk/_internal')
  return {...actual, isDashboardEnvironment: vi.fn(() => false)}
})

const mockLogout = vi.fn(async () => {})
vi.mock('../../hooks/auth/useLogOut', () => ({
  useLogOut: vi.fn(() => mockLogout),
}))

const mockUseCurrentUser = vi.fn((): CurrentUser | null => null)
vi.mock('../../hooks/auth/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser(),
}))

const mockWindowConnectionFetch = vi.fn()
vi.mock('../../hooks/comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(() => ({fetch: mockWindowConnectionFetch})),
}))

const mockIsDashboardEnvironment = isDashboardEnvironment as Mock

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
    mockIsDashboardEnvironment.mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockUseCurrentUser.mockReturnValue(null)
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
    mockIsDashboardEnvironment.mockReturnValue(false)

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
      expect(screen.getByText("You don't have access to this project")).toBeInTheDocument()
    })
    expect(screen.queryByText('Authentication Error')).not.toBeInTheDocument()
    expect(screen.queryByText('Configuration Error')).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Sign out and switch account'})).toBeInTheDocument()
    expect(screen.queryByText('SUSPENDED')).not.toBeInTheDocument()
    expect(mockWindowConnectionFetch).not.toHaveBeenCalled()
  })

  it('fires the dashboard access request on a 401 projectUserNotFound error inside the dashboard', async () => {
    mockIsDashboardEnvironment.mockReturnValue(true)

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

  it('does not request access when neither the error nor the config names a project', async () => {
    mockIsDashboardEnvironment.mockReturnValue(true)
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

    expect(await screen.findByText("You don't have access to this project")).toBeInTheDocument()
    expect(screen.queryByText('SUSPENDED')).not.toBeInTheDocument()
    expect(mockWindowConnectionFetch).not.toHaveBeenCalled()
  })

  it('prefers the project named in the error over the configured projectId', async () => {
    mockIsDashboardEnvironment.mockReturnValue(true)
    const error = makeClientError(401, {
      error: {type: 'projectUserNotFoundError', description: 'No access.', projectID: 'exx11uqh'},
    })

    render(
      <ResourceProvider projectId="abc123" dataset="production" fallback={<div>SUSPENDED</div>}>
        <LoginError error={error} resetErrorBoundary={vi.fn()} />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(mockWindowConnectionFetch).toHaveBeenCalledWith('dashboard/v1/auth/access/request', {
        resourceType: 'project',
        resourceId: 'exx11uqh',
      })
    })
  })

  it('requests access to the project named in the error without a configured projectId', async () => {
    mockIsDashboardEnvironment.mockReturnValue(true)
    const error = makeClientError(401, {
      error: {
        type: 'projectUserNotFoundError',
        description: 'User is not a member of this project.',
        projectID: 'exx11uqh',
      },
    })

    render(
      <ResourceProvider fallback={<div>SUSPENDED</div>}>
        <LoginError error={error} resetErrorBoundary={vi.fn()} />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(mockWindowConnectionFetch).toHaveBeenCalledWith('dashboard/v1/auth/access/request', {
        resourceType: 'project',
        resourceId: 'exx11uqh',
      })
    })
  })

  // Mirrors the real production chain: AuthBoundary wraps the ClientError in
  // an AuthError before the error boundary hands it to LoginError. The
  // `.cause` unwrap is what makes the dashboard access request path reachable
  // at runtime (without it, the previous `error instanceof ClientError` check
  // was dead code in the dashboard).
  it('fires the dashboard access request when the projectUserNotFound ClientError is wrapped in an AuthError', async () => {
    mockIsDashboardEnvironment.mockReturnValue(true)

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

    expect(screen.getByText("You don't have access to this project")).toBeInTheDocument()
    // projectUserNotFound intentionally hides the Retry CTA: the user can't
    // fix it by retrying, only by getting access granted through the
    // dashboard access request flow above. The dashboard owns the session, so
    // there is no sign-out CTA either.
    expect(screen.queryByRole('button', {name: 'Retry'})).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {name: 'Sign out and switch account'}),
    ).not.toBeInTheDocument()
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
    mockIsDashboardEnvironment.mockReturnValue(false)

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
    mockIsDashboardEnvironment.mockReturnValue(true)

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

  it('explains an expired session ID on a 404', () => {
    const error = new AuthError(
      makeClientError(404, {message: 'Session with sid abc123 not found'}),
    )

    render(
      <ResourceProvider fallback={null}>
        <LoginError error={error} resetErrorBoundary={vi.fn()} />
      </ResourceProvider>,
    )

    expect(screen.getByText('The session ID is invalid or expired.')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'Retry'})).toBeInTheDocument()
  })

  it('explains an invalid login link on any other 404', () => {
    const error = new AuthError(makeClientError(404, {message: 'Not found'}))

    render(
      <ResourceProvider fallback={null}>
        <LoginError error={error} resetErrorBoundary={vi.fn()} />
      </ResourceProvider>,
    )

    expect(
      screen.getByText('The login link is invalid or expired. Please try again.'),
    ).toBeInTheDocument()
  })

  describe('project access screen', () => {
    const projectUserNotFound = (headers: Record<string, string> = {}) =>
      new AuthError(
        new ClientError({
          statusCode: 401,
          headers,
          body: {
            error: {
              type: 'projectUserNotFoundError',
              description: 'project user not found for user ID "gUser123" in project "other456"',
              projectID: 'other456',
              userID: 'gUser123',
            },
          },
          url: 'https://other456.api.sanity.io/v2025-01-01/data/query/production',
          method: 'GET',
        } as ConstructorParameters<typeof ClientError>[0]),
      )

    it('names the signed-in account and its sign-in method', () => {
      mockUseCurrentUser.mockReturnValue({
        id: 'gUser123',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        provider: 'google',
        role: '',
        roles: [],
      })

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError error={projectUserNotFound()} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      expect(
        screen.getByText(
          "You're signed in as Ada Lovelace (ada@example.com) with Google. This account isn't a member of project other456.",
        ),
      ).toBeInTheDocument()
    })

    it('labels SAML providers as SSO', () => {
      mockUseCurrentUser.mockReturnValue({
        id: 'gUser123',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        provider: 'saml-abc',
        role: '',
        roles: [],
      })

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError error={projectUserNotFound()} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      expect(screen.getByText(/with SSO\./)).toBeInTheDocument()
    })

    it('shows support details from the API response and never its raw description', () => {
      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError
            error={projectUserNotFound({
              traceparent: '00-e711e3474d6727051e0912eb9ef7883c-00f067aa0ba902b7-01',
            })}
            resetErrorBoundary={vi.fn()}
          />
        </ResourceProvider>,
      )

      expect(
        screen.getByText("The account you're signed in with isn't a member of project other456."),
      ).toBeInTheDocument()
      expect(screen.getByText('other456')).toBeInTheDocument()
      expect(screen.getByText('gUser123')).toBeInTheDocument()
      expect(screen.getByText('e711e3474d6727051e0912eb9ef7883c')).toBeInTheDocument()
      expect(screen.queryByText(/project user not found/)).not.toBeInTheDocument()
    })

    it('signs out and resets the boundary from the switch account CTA', async () => {
      const mockReset = vi.fn()

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError error={projectUserNotFound()} resetErrorBoundary={mockReset} />
        </ResourceProvider>,
      )

      expect(mockLogout).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', {name: 'Sign out and switch account'}))

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled()
        expect(mockReset).toHaveBeenCalled()
      })
    })

    it('omits the switch account CTA when the app uses a static token', () => {
      render(
        <ResourceProvider
          projectId="abc123"
          dataset="production"
          auth={{token: 'static-token'}}
          fallback={null}
        >
          <LoginError error={projectUserNotFound()} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      expect(
        screen.queryByRole('button', {name: 'Sign out and switch account'}),
      ).not.toBeInTheDocument()
      expect(
        screen.getByText(
          'To use another account, sign out of Sanity and sign in again with the method that has access.',
        ),
      ).toBeInTheDocument()
    })

    // Mirrors the example on getProjectAccessErrorProjectId: hooks throw the
    // raw ClientError to the nearest app boundary, which rethrows it only for
    // the project the whole app needs.
    describe('behind an app-level error boundary', () => {
      function ThrowsProjectAccessError(): never {
        throw projectUserNotFound().cause
      }

      function renderWithAppBoundary(mainProjectId: string) {
        function AppFallback({error}: FallbackProps) {
          const projectId = getProjectAccessErrorProjectId(error)
          if (projectId === mainProjectId) throw error
          return <p>App fallback for {projectId}</p>
        }

        render(
          <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
            <ErrorBoundary FallbackComponent={LoginError}>
              <ErrorBoundary FallbackComponent={AppFallback}>
                <ThrowsProjectAccessError />
              </ErrorBoundary>
            </ErrorBoundary>
          </ResourceProvider>,
        )
      }

      // React logs every caught render error.
      let consoleErrorSpy: ReturnType<typeof vi.spyOn>
      beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      })
      afterEach(() => {
        consoleErrorSpy.mockRestore()
      })

      it('shows the project access screen when the app rethrows for its main project', () => {
        renderWithAppBoundary('other456')

        expect(screen.getByText("You don't have access to this project")).toBeInTheDocument()
        expect(screen.queryByText(/App fallback/)).not.toBeInTheDocument()
      })

      it('keeps the app fallback for any other project', () => {
        renderWithAppBoundary('abc123')

        expect(screen.getByText('App fallback for other456')).toBeInTheDocument()
        expect(screen.queryByText("You don't have access to this project")).not.toBeInTheDocument()
      })
    })

    it('requests dashboard access for the project named in the API response', async () => {
      mockIsDashboardEnvironment.mockReturnValue(true)

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError error={projectUserNotFound()} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      await waitFor(() => {
        expect(mockWindowConnectionFetch).toHaveBeenCalledWith('dashboard/v1/auth/access/request', {
          resourceType: 'project',
          resourceId: 'other456',
        })
      })
    })
  })

  describe('under the message bus', () => {
    const MESSAGE_BUS_KEY = Symbol.for('sanity.os.bus')
    let host: MessageBusHost

    beforeEach(async () => {
      const actual =
        await vi.importActual<typeof import('@sanity/sdk/_internal')>('@sanity/sdk/_internal')
      mockIsDashboardEnvironment.mockImplementation(actual.isDashboardEnvironment)
      vi.stubGlobal('__SANITY_APP_ID__', 'app')
      host = installMessageBus({appId: 'dashboard'})
    })

    afterEach(() => {
      resetMessageBus()
      delete (globalThis as {[MESSAGE_BUS_KEY]?: unknown})[MESSAGE_BUS_KEY]
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('requests project access over the bus on a 401 projectUserNotFound error', async () => {
      const requests: PayloadOf<'access.request'>[] = []
      host.subscribe('access.request', (message) => {
        requests.push(message.payload)
        message.reply({ok: true})
      })
      const error = new AuthError(
        makeClientError(401, {
          error: {
            type: 'projectUserNotFoundError',
            description: 'User is not a member of this project.',
          },
        }),
      )

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={<div>SUSPENDED</div>}>
          <LoginError error={error} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      await waitFor(() => {
        expect(requests).toEqual([{resourceType: 'project', resourceId: 'abc123'}])
      })
      expect(mockWindowConnectionFetch).not.toHaveBeenCalled()
      expect(mockLogout).not.toHaveBeenCalled()
    })

    it('requests access over the bus to the project named in the error', async () => {
      const requests: PayloadOf<'access.request'>[] = []
      host.subscribe('access.request', (message) => {
        requests.push(message.payload)
        message.reply({ok: true})
      })
      const error = new AuthError(
        makeClientError(401, {
          error: {
            type: 'projectUserNotFoundError',
            description: 'No access.',
            projectID: 'exx11uqh',
          },
        }),
      )

      render(
        <ResourceProvider fallback={<div>SUSPENDED</div>}>
          <LoginError error={error} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      await waitFor(() => {
        expect(requests).toEqual([{resourceType: 'project', resourceId: 'exx11uqh'}])
      })
    })

    const projectUserNotFound = () =>
      new AuthError(
        makeClientError(401, {
          error: {
            type: 'projectUserNotFoundError',
            description: 'User is not a member of this project.',
          },
        }),
      )

    it('warns when the dashboard declines the access request', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      host.subscribe('access.request', (message) =>
        message.reply({ok: false, reason: 'already-has-access'}),
      )

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError error={projectUserNotFound()} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      await waitFor(() => {
        expect(warn).toHaveBeenCalledWith('[sanity/sdk] Dashboard declined the access request:', {
          ok: false,
          reason: 'already-has-access',
        })
      })
    })

    it('warns when nothing responds to the access request', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError error={projectUserNotFound()} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      await waitFor(() => {
        expect(warn).toHaveBeenCalledWith(
          '[sanity/sdk] Dashboard access request failed:',
          expect.objectContaining({code: 'NO_RESPONDER'}),
        )
      })
    })

    it('falls back to comlink when a bus is installed but cannot connect', async () => {
      vi.stubGlobal('__SANITY_APP_ID__', undefined)
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const error = new AuthError(
        makeClientError(401, {
          error: {
            type: 'projectUserNotFoundError',
            description: 'User is not a member of this project.',
          },
        }),
      )

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={<div>SUSPENDED</div>}>
          <LoginError error={error} resetErrorBoundary={vi.fn()} />
        </ResourceProvider>,
      )

      expect(await screen.findByText("You don't have access to this project")).toBeInTheDocument()
      expect(mockWindowConnectionFetch).toHaveBeenCalledWith('dashboard/v1/auth/access/request', {
        resourceType: 'project',
        resourceId: 'abc123',
      })
    })

    it('does not auto-log-out on a non-projectUserNotFound 401 when a bus is installed', async () => {
      const mockReset = vi.fn()
      const error = new AuthError(
        makeClientError(401, {error: {type: 'someOther401Type', description: 'Token is invalid'}}),
      )

      render(
        <ResourceProvider projectId="abc123" dataset="production" fallback={null}>
          <LoginError error={error} resetErrorBoundary={mockReset} />
        </ResourceProvider>,
      )

      expect(
        await screen.findByText('Please try again or contact support if the problem persists.'),
      ).toBeInTheDocument()
      expect(mockLogout).not.toHaveBeenCalled()
      expect(mockReset).not.toHaveBeenCalled()
    })
  })
})
