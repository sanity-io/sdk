import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {render, screen, waitFor} from '@testing-library/react'
import React from 'react'
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

const theme = buildTheme({})
const sanityInstance = createSanityInstance({projectId: 'test-project-id', dataset: 'production'})

const renderWithWrappers = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <SanityProvider sanityInstance={sanityInstance}>{ui}</SanityProvider>
    </ThemeProvider>,
  )
}

// Mock `useHandleCallback`
vi.mock('../../hooks/auth/useHandleCallback', () => ({
  useHandleCallback: vi.fn(() => async (url: string) => {
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
    renderWithWrappers(<LoginCallback />)
    expect(screen.getByText('Logging you in…')).toBeInTheDocument()
  })

  it('handles a successful callback and calls history.replaceState', async () => {
    // Simulate a valid `sid` in the location hash
    vi.stubGlobal('location', {href: 'http://localhost#sid=valid'})
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules

    renderWithWrappers(<LoginCallback />)

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

    renderWithWrappers(<LoginCallback />)

    await waitFor(() => {
      expect(history.replaceState).not.toHaveBeenCalled()
    })
  })
})
