import {describe, expect, it} from 'vitest'

import {render, screen} from '../../../test/test-utils'
import {CorsErrorComponent} from './CorsErrorComponent'

describe('CorsErrorComponent', () => {
  it('shows origin and manage link when projectId is provided', () => {
    const origin = 'https://example.com'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location
    // @ts-expect-error allow setting minimal location for test
    window.location = {origin} as Location

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
    // @ts-expect-error restore
    window.location = originalLocation
  })

  it('shows error message when projectId is null', () => {
    const error = new Error('some error message')
    render(<CorsErrorComponent projectId={null} error={error} resetErrorBoundary={() => {}} />)

    expect(screen.getByText('Before you continue...')).toBeInTheDocument()
    expect(screen.getByText('some error message')).toBeInTheDocument()
    expect(screen.queryByRole('link', {name: 'Manage CORS configuration'})).toBeNull()
  })
})
