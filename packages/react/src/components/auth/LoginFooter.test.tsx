import {screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {renderWithWrappers} from './authTestHelpers'
import {LoginFooter} from './LoginFooter'

describe('LoginFooter', () => {
  it('renders footer links', () => {
    renderWithWrappers(<LoginFooter />)
    expect(screen.getByText('Community')).toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.getByText('sanity.io')).toBeInTheDocument()
  })
})
