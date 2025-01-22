import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, screen} from '@testing-library/react'
import React from 'react'
import {describe, expect, it, vi} from 'vitest'

import {Login} from './Login'

vi.mock('../../hooks/auth/useLoginUrls', () => ({
  useLoginUrls: vi.fn(() => [
    {title: 'Provider A', url: 'https://provider-a.com/auth'},
    {title: 'Provider B', url: 'https://provider-b.com/auth'},
  ]),
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

describe('Login', () => {
  it('renders login providers', () => {
    renderWithWrappers(<Login />)
    expect(screen.getByText('Choose login provider')).toBeInTheDocument()
    expect(screen.getByRole('link', {name: 'Provider A'})).toHaveAttribute(
      'href',
      'https://provider-a.com/auth',
    )
    expect(screen.getByRole('link', {name: 'Provider B'})).toHaveAttribute(
      'href',
      'https://provider-b.com/auth',
    )
  })
})
