import {
  getClient,
  getSidUrlHash as getSidUrlSearch,
  type SanityInstance,
  tradeTokenForSession,
} from '@sanity/sdk'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, screen} from '@testing-library/react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {useLoginLinks} from '../../hooks/auth/useLoginLinks'
import {LoginLinks} from './LoginLinks'

// Mock the hooks and SDK functions
vi.mock('../../hooks/auth/useLoginLinks', () => ({
  useLoginLinks: vi.fn(() => [
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
vi.mock('@sanity/sdk', () => ({
  getClient: vi.fn(),
  tradeTokenForSession: vi.fn(),
  getSidUrlHash: vi.fn().mockReturnValue(null),
}))

// Add mock for core getSidUrlSearch
vi.mock('../../../../core/src/auth/sessionId', () => ({
  getSidUrlSearch: vi.fn(),
}))

const theme = buildTheme({})

describe('LoginLinks', () => {
  const mockSanityInstance = {
    identity: {
      projectId: 'test-project-id',
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock getClient return value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(getClient).mockReturnValue({} as any)
    // Mock successful token response
    vi.mocked(tradeTokenForSession).mockResolvedValue('mock-token')
  })

  const renderWithTheme = (ui: React.ReactElement) => {
    return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
  }

  it('renders auth provider links correctly', () => {
    renderWithTheme(<LoginLinks sanityInstance={mockSanityInstance as SanityInstance} />)

    // Check if the heading is present
    expect(screen.getByText('Choose login provider')).toBeInTheDocument()

    // Check if all provider links are rendered as buttons
    const authProviders = useLoginLinks()
    authProviders.forEach((provider) => {
      const button = screen.getByRole('link', {name: provider.title})
      expect(button).toBeInTheDocument()
      expect(button).toHaveAttribute('href', provider.url)
    })
  })

  it.skip('handles URL search parameter and displays token message', async () => {
    // Mock getSidUrlSearch to return a token
    vi.mocked(getSidUrlSearch).mockReturnValue('mock-sid-token')

    renderWithTheme(<LoginLinks sanityInstance={mockSanityInstance as SanityInstance} />)

    // Verify that the login providers are not shown
    expect(screen.queryByText('Choose login provider')).not.toBeInTheDocument()

    // Wait for the token message to appear
    const tokenMessage = await screen.findByText('You are logged in with token: mock-token')
    expect(tokenMessage).toBeInTheDocument()
    expect(tradeTokenForSession).toHaveBeenCalledWith('mock-sid-token', mockSanityInstance)
  })
})
