import {ClientError} from '@sanity/client'
import {AuthStateType} from '@sanity/sdk'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import * as useAuthStateModule from '../../hooks/auth/useAuthState'
import * as useLogOutModule from '../../hooks/auth/useLogOut'
import {AuthError} from './AuthError'
import {LoginError} from './LoginError'

vi.mock('../../hooks/auth/useLogOut', () => ({
  useLogOut: vi.fn(() => async () => {}),
}))

// Mock useAuthState with default implementation
vi.mock('../../hooks/auth/useAuthState', () => ({
  useAuthState: vi.fn(() => ({
    type: AuthStateType.LOGGED_IN,
  })),
}))

describe('LoginError', () => {
  beforeEach(() => {
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

  it.only('automatically retries on 401 Unauthorized error', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    const mockReset = vi.fn()
    const error = new AuthError(new Error('Test error'))

    vi.spyOn(useLogOutModule, 'useLogOut').mockReturnValue(mockLogout)
    vi.spyOn(useAuthStateModule, 'useAuthState').mockReturnValue({
      type: AuthStateType.ERROR,
      error: new ClientError({
        statusCode: 401,
        method: 'GET',
        url: 'https://api.sanity.io/some/endpoint',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          error: 'Unauthorized',
          message: 'Invalid credentials',
        },
      }),
    })

    render(
      <ResourceProvider fallback={null}>
        <LoginError error={error} resetErrorBoundary={mockReset} />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
      expect(mockReset).toHaveBeenCalled()
    })
  })

  it('shows session ID error message on 404 with session ID error', async () => {
    const mockReset = vi.fn()
    const error = new AuthError(new Error('Test error'))

    vi.spyOn(useAuthStateModule, 'useAuthState').mockReturnValue({
      type: AuthStateType.ERROR,
      error: new ClientError({
        statusCode: 404,
        method: 'GET',
        url: 'https://api.sanity.io/some/endpoint',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          error: 'Not Found',
          message: 'Session with sid abc123 not found',
        },
      }),
    })

    render(
      <ResourceProvider fallback={null}>
        <LoginError error={error} resetErrorBoundary={mockReset} />
      </ResourceProvider>,
    )

    expect(screen.getByText('The session ID is invalid or expired.')).toBeInTheDocument()
  })

  it('shows login link error message on other 404 errors', async () => {
    const mockReset = vi.fn()
    const error = new AuthError(new Error('Test error'))

    vi.spyOn(useAuthStateModule, 'useAuthState').mockReturnValue({
      type: AuthStateType.ERROR,
      error: new ClientError({
        statusCode: 404,
        method: 'GET',
        url: 'https://api.sanity.io/some/endpoint',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          error: 'Not Found',
          message: 'Some other 404 error',
        },
      }),
    })

    render(
      <ResourceProvider fallback={null}>
        <LoginError error={error} resetErrorBoundary={mockReset} />
      </ResourceProvider>,
    )

    expect(
      screen.getByText('The login link is invalid or expired. Please try again.'),
    ).toBeInTheDocument()
  })

  it('throws an error if the error is not an instance of AuthError', () => {
    const mockReset = vi.fn()
    const nonAuthError = new Error('Non-auth error')

    // Suppress console.error during this test
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(
        <ResourceProvider fallback={null}>
          <LoginError error={nonAuthError} resetErrorBoundary={mockReset} />
        </ResourceProvider>,
      )
    }).toThrow('Non-auth error')

    consoleErrorSpy.mockRestore() // Restore original console.error behavior
  })
})
