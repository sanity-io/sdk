import {screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {renderWithWrappers} from './authTestHelpers'
import {LoginLayout} from './LoginLayout'

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
