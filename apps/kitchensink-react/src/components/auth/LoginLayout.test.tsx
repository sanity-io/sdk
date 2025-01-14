import {createSanityInstance} from '@sanity/sdk'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, screen} from '@testing-library/react'
import React from 'react'
import {describe, expect, it} from 'vitest'

import {SanityProvider} from '../context/SanityProvider'
import {LoginLayout} from './LoginLayout'

const theme = buildTheme({})
const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})
const renderWithWrappers = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <SanityProvider sanityInstance={sanityInstance}>{ui}</SanityProvider>
    </ThemeProvider>,
  )
}

describe('LoginLayout', () => {
  it('renders header, children, and footer', () => {
    renderWithWrappers(
      <LoginLayout header={<div>Header Content</div>} footer={<div>Footer Content</div>}>
        <div>Main Content</div>
      </LoginLayout>,
    )

    expect(screen.getByText('Header Content')).toBeInTheDocument()
    expect(screen.getByText('Main Content')).toBeInTheDocument()
    expect(screen.getByText('Footer Content')).toBeInTheDocument()
  })
})
