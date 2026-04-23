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

vi.mock('../../hooks/auth/useLogOut', () => ({
  useLogOut: vi.fn(() => async () => {}),
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

  // SDK-1318: in a standalone app (not embedded in the dashboard) the
  // dashboard access request path must not render, because useWindowConnection
  // would suspend waiting for a comlink node that never arrives.
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
})
