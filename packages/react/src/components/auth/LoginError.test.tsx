import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {AuthError} from './AuthError'
import {LoginError} from './LoginError'

vi.mock('../../hooks/auth/useLogOut', () => ({
  useLogOut: vi.fn(() => async () => {}),
}))

vi.mock('../../hooks/comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(() => ({fetch: vi.fn()})),
}))

describe('LoginError', () => {
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
