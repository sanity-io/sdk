import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, screen} from '@testing-library/react'
import React from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useAuthState} from '../../hooks/auth/useAuthState'
import {useLoginUrls} from '../../hooks/auth/useLoginUrls'
import {SanityProvider} from '../context/SanityProvider'
import {LoginLinks} from './LoginLinks'
import {createSanityInstance} from '@sanity/sdk'

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
      type: 'logged-out',
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
      type: 'logging-in',
      isExchangingToken: false,
    })
    renderWithWrappers(<LoginLinks />)

    expect(screen.getByText('Logging in...')).toBeInTheDocument()
  })

  it('shows success message when logged in', () => {
    vi.mocked(useAuthState).mockReturnValue({
      type: 'logged-in',
      token: 'test-token',
      currentUser: null,
    })
    renderWithWrappers(<LoginLinks />)

    expect(screen.getByText('You are logged in')).toBeInTheDocument()
  })
})
