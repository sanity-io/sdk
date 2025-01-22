import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, screen} from '@testing-library/react'
import React from 'react'
import {describe, expect, it} from 'vitest'

import {LoginFooter} from './LoginFooter'

const theme = buildTheme({})
const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})
const renderWithWrappers = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <SanityProvider sanityInstance={sanityInstance}>{ui}</SanityProvider>
    </ThemeProvider>,
  )
}

describe('LoginFooter', () => {
  it('renders footer links', () => {
    renderWithWrappers(<LoginFooter />)
    expect(screen.getByText('Community')).toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.getByText('sanity.io')).toBeInTheDocument()
  })
})
