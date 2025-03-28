import {render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {LoginFooter} from './LoginFooter'

describe('LoginFooter', () => {
  it('renders footer links', () => {
    render(
      <ResourceProvider fallback={null}>
        <LoginFooter />
      </ResourceProvider>,
    )
    expect(screen.getByText('Community')).toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
    expect(screen.getByText('Privacy')).toBeInTheDocument()
    expect(screen.getByText('sanity.io')).toBeInTheDocument()
  })
})
