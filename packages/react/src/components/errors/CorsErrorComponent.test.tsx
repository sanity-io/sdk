import {describe, expect, it} from 'vitest'

import {render, screen} from '../../../test/test-utils'
import {CorsErrorComponent} from './CorsErrorComponent'

describe('CorsErrorComponent', () => {
  it('shows origin and manage link when projectId is provided', () => {
    const origin = 'https://example.com'
    const originalLocation = window.location
    // Redefine window.location to control origin in this test
    Object.defineProperty(window, 'location', {
      value: {origin},
      configurable: true,
    })

    render(
      <CorsErrorComponent
        projectId="proj123"
        error={new Error('nope')}
        resetErrorBoundary={() => {}}
      />,
    )

    expect(screen.getByText('Before you continue...')).toBeInTheDocument()
    expect(screen.getByText(origin)).toBeInTheDocument()

    const link = screen.getByRole('link', {name: 'Manage CORS configuration'}) as HTMLAnchorElement
    expect(link).toBeInTheDocument()
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noopener')
    expect(link.href).toContain('https://sanity.io/manage/project/proj123/api')
    expect(link.href).toContain('cors=add')
    expect(link.href).toContain(`origin=${encodeURIComponent(origin)}`)
    expect(link.href).toContain('credentials=include')

    // restore
    Object.defineProperty(window, 'location', {value: originalLocation})
  })

  it('shows error message when projectId is null', () => {
    const error = new Error('some error message')
    render(<CorsErrorComponent projectId={null} error={error} resetErrorBoundary={() => {}} />)

    expect(screen.getByText('Before you continue...')).toBeInTheDocument()
    expect(screen.getByText('some error message')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Manage CORS configuration'})).toBeNull()
  })
})
