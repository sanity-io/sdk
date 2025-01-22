import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'

import {AuthError} from './AuthError'
import {LoginError} from './LoginError'

vi.mock('../../hooks/auth/useLogOut', () => ({
  useLogOut: vi.fn(() => async () => {}),
}))

const theme = buildTheme({})
const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})

const renderWithWrappers = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <SanityProvider sanityInstance={sanityInstance}>{ui}</SanityProvider>
    </ThemeProvider>,
  )
}

describe('LoginError', () => {
  it('shows authentication error and retry button', async () => {
    const mockReset = vi.fn()
    const error = new AuthError(new Error('Test error'))

    renderWithWrappers(<LoginError error={error} resetErrorBoundary={mockReset} />)

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
      renderWithWrappers(<LoginError error={nonAuthError} resetErrorBoundary={mockReset} />)
    }).toThrow('Non-auth error')

    consoleErrorSpy.mockRestore() // Restore original console.error behavior
  })
})
