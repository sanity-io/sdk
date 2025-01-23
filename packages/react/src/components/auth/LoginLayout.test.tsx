import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {render, screen} from '@testing-library/react'
import React from 'react'
import {describe, expect, it} from 'vitest'

import {LoginLayout} from './LoginLayout'

const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})
const renderWithWrappers = (ui: React.ReactElement) => {
  return render(<SanityProvider sanityInstance={sanityInstance}>{ui}</SanityProvider>)
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
