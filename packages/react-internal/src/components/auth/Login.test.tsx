import {screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import {renderWithWrappers} from './authTestHelpers'
import {Login} from './Login'

vi.mock('@sanity/sdk-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/sdk-react')>()
  return {
    ...actual,
    useLoginUrls: vi.fn(() => [
      {title: 'Provider A', url: 'https://provider-a.com/auth'},
      {title: 'Provider B', url: 'https://provider-b.com/auth'},
    ]),
  }
})

describe('Login', () => {
  it('renders login providers', () => {
    renderWithWrappers(<Login />)
    expect(screen.getByText('Choose login provider:')).toBeInTheDocument()
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
