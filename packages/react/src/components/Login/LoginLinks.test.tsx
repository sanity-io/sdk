import {AuthStateType, createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {useAuthState, useLoginUrls} from '@sanity/sdk-react/hooks'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, screen} from '@testing-library/react'
import React from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {LoginLinks} from './LoginLinks'

// Mock the hooks and SDK functions
vi.mock('../../hooks/auth/useLoginUrls', () => ({
  useLoginUrls: vi.fn(() => [
    {
      name: 'google',
      title: 'Google',
      url: 'https://google.com/auth',
    },
    {
      name: 'github',
      title: 'GitHub',
      url: 'https://github.com/auth',
    },
  ]),
}))
vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')

  return {
    ...actual,
    tradeTokenForSession: vi.fn(),
    getSidUrlHash: vi.fn().mockReturnValue(null),
    getSidUrlSearch: vi.fn(),
  }
})

vi.mock('../../hooks/auth/useAuthState', () => ({
  useAuthState: vi.fn(() => 'logged-out'),
}))

vi.mock('../../hooks/auth/useHandleCallback', () => ({
  useHandleCallback: vi.fn(),
}))

const theme = buildTheme({})

describe('LoginLinks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})
  const renderWithWrappers = (ui: React.ReactElement) => {
    return render(
      <ThemeProvider theme={theme}>
        <SanityProvider sanityInstance={sanityInstance}>{ui}</SanityProvider>
      </ThemeProvider>,
    )
  }

  it('renders auth provider links correctly when not authenticated', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGED_OUT,
      isDestroyingSession: false,
    })
    renderWithWrappers(<LoginLinks />)

    expect(screen.getByText('Choose login provider')).toBeInTheDocument()

    const authProviders = useLoginUrls()
    authProviders.forEach((provider) => {
      const button = screen.getByRole('link', {name: provider.title})
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('href', provider.url)
    })
  })

  it('shows loading state while logging in', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGING_IN,
      isExchangingToken: false,
    })
    renderWithWrappers(<LoginLinks />)

    expect(screen.getByText('Logging in...')).toBeInTheDocument()
  })

  it('shows success message when logged in', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: AuthStateType.LOGGED_IN,
      token: 'test-token',
      currentUser: null,
    })
    renderWithWrappers(<LoginLinks />)

    expect(screen.getByText('You are logged in')).toBeInTheDocument()
  })
})
