import {render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import * as useLoginLinksModule from '../../hooks/auth/useLoginLinks'
import {LoginLinks} from './LoginLinks'

describe('LoginLinks', () => {
  it('renders login provider links correctly', () => {
    // Mock the useLoginLinks hook
    const mockProviders = [
      {name: 'google', url: 'https://login.google.com', title: 'Login with Google'},
      {name: 'github', url: 'https://login.github.com', title: 'Login with GitHub'},
    ]

    vi.spyOn(useLoginLinksModule, 'useLoginLinks').mockReturnValue(mockProviders)

    render(<LoginLinks projectId="test-project" />)

    // Verify that links are rendered correctly
    mockProviders.forEach((provider) => {
      const link = screen.getByText(provider.title)
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', provider.url)
    })
  })

  it('renders empty when no providers are available', () => {
    // Mock empty providers array
    vi.spyOn(useLoginLinksModule, 'useLoginLinks').mockReturnValue([])

    const {container} = render(<LoginLinks projectId="test-project" />)

    expect(container.firstChild).toBeEmptyDOMElement()
  })
})
