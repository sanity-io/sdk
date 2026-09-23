import {render, waitFor} from '@testing-library/react'
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'

// Mock `useHandleAuthCallback`
vi.mock('../../hooks/auth/useHandleAuthCallback', () => ({
  useHandleAuthCallback: vi.fn(() => async (url: string) => {
    const parsedUrl = new URL(url)
    const sid = new URLSearchParams(parsedUrl.hash.slice(1)).get('sid')
    if (sid === 'valid') {
      // same document, hash stripped
      return 'http://localhost/'
    }
    if (sid === 'deep-link') {
      return 'http://localhost/documents/abc?x=1'
    }
    if (sid === 'cross-origin') {
      return 'https://evil.example.com/'
    }
    if (sid === 'same-path-query') {
      return 'http://localhost/?tab=2'
    }
    if (sid === 'same-path-hash') {
      return 'http://localhost/#heading'
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
    const {container} = render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )
    // The callback screen renders null check that it renders nothing
    expect(container.innerHTML).toBe('')
  })

  it('handles a successful callback and calls history.replaceState', async () => {
    // Simulate a valid `sid` in the location hash
    const replace = vi.fn()
    vi.stubGlobal('location', {href: 'http://localhost/#sid=valid', replace})
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules

    render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(history.replaceState).toHaveBeenCalledWith(null, '', 'http://localhost/')
    })
    expect(replace).not.toHaveBeenCalled()
  })

  it('navigates when the callback resolves to a different route', async () => {
    const replace = vi.fn()
    vi.stubGlobal('location', {href: 'http://localhost/#sid=deep-link', replace})
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules

    render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('http://localhost/documents/abc?x=1')
    })
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it.each([
    ['query', 'same-path-query', 'http://localhost/?tab=2'],
    ['hash', 'same-path-hash', 'http://localhost/#heading'],
  ])('navigates when the return location adds a %s on the same path', async (_, sid, expected) => {
    const replace = vi.fn()
    vi.stubGlobal('location', {href: `http://localhost/#sid=${sid}`, replace})
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules

    render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith(expected)
    })
    expect(history.replaceState).not.toHaveBeenCalled()
  })

  it('does not navigate when the callback resolves to a different origin', async () => {
    const replace = vi.fn()
    vi.stubGlobal('location', {href: 'http://localhost/#sid=cross-origin', replace})
    const {LoginCallback} = await import('./LoginCallback') // Reload after resetModules

    render(
      <ResourceProvider fallback={null}>
        <LoginCallback />
      </ResourceProvider>,
    )

    await waitFor(() => {
      expect(replace).not.toHaveBeenCalled()
      expect(history.replaceState).not.toHaveBeenCalled()
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
