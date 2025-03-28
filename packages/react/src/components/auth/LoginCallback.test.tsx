import {render, screen, waitFor} from '@testing-library/react'
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'

// Mock `useHandleAuthCallback`
vi.mock('../../hooks/auth/useHandleAuthCallback', () => ({
  useHandleAuthCallback: vi.fn(() => async (url: string) => {
    const parsedUrl = new URL(url)
    const sid = new URLSearchParams(parsedUrl.hash.slice(1)).get('sid')
    if (sid === 'valid') {
      return 'https://example.com/new-location'
    }
    return false
  }),
}))

describe('LoginCallback', () => {
  beforeAll(() => {
    // Stub `window.history` and `location`
    vi.stubGlobal('history', {
      replaceState: vi.fn(),
    })
    vi.stubGlobal('location', {
      href: 'http://localhost',
    })
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('renders a loading message', async () => {
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules
    render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )
    expect(screen.getByText('Logging you in…')).toBeInTheDocument()
  })

  it('handles a successful callback and calls history.replaceState', async () => {
    // Simulate a valid `sid` in the location hash
    vi.stubGlobal('location', {href: 'http://localhost#sid=valid'})
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules

    render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(history.replaceState).toHaveBeenCalledWith(
        null,
        '',
        'https://example.com/new-location',
      )
    })
  })

  it('does not call history.replaceState on an unsuccessful callback', async () => {
    // Simulate an invalid `sid` in the location hash
    vi.stubGlobal('location', {href: 'http://localhost#sid=invalid'})
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules

    render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(history.replaceState).not.toHaveBeenCalled()
    })
  })
})
