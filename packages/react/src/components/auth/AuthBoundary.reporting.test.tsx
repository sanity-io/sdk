import {createSanityInstance} from '@sanity/sdk'
import {reportError} from '@sanity/sdk/_internal'
import {render, screen} from '@testing-library/react'
import {Component, type ReactNode} from 'react'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {AuthBoundary} from './AuthBoundary'
import {AuthError} from './AuthError'

// These tests render the real `react-error-boundary`. `AuthBoundary.test.tsx` replaces it with a
// mock that always calls `componentDidCatch`, which React does not do for a boundary whose
// fallback rethrows.
vi.mock('@sanity/sdk/_internal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  reportError: vi.fn(),
}))
vi.mock('../../hooks/auth/useAuthState', () => ({
  useAuthState: vi.fn(() => ({type: 'logged-in', token: 'token', currentUser: null})),
}))
const instance = createSanityInstance()
vi.mock('../../hooks/context/useSanityInstance', () => ({useSanityInstance: () => instance}))
vi.mock('../../hooks/auth/useLoginUrl')
vi.mock('../../hooks/auth/useOAuthAuthorize', () => ({useOAuthAuthorize: vi.fn(() => vi.fn())}))
vi.mock('../../hooks/auth/useVerifyOrgProjects')
vi.mock('../../hooks/auth/useHandleAuthCallback', () => ({
  useHandleAuthCallback: vi.fn(() => async () => {}),
}))
vi.mock('../../hooks/auth/useLogOut', () => ({useLogOut: vi.fn(() => async () => {})}))
vi.mock('../../hooks/comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(() => ({fetch: vi.fn()})),
}))
vi.mock('../utils', () => ({isInIframe: vi.fn(() => false)}))

/** Stands in for the app's own boundary that receives errors the SDK rethrows. */
class AppBoundary extends Component<{children: ReactNode}, {caught: boolean}> {
  override state = {caught: false}
  static getDerivedStateFromError() {
    return {caught: true}
  }
  override render() {
    return this.state.caught ? 'app boundary caught it' : this.props.children
  }
}

function Thrower({error}: {error: Error}): never {
  throw error
}

describe('AuthBoundary error reporting', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reports a plain error from a child and still rethrows it to the app boundary', () => {
    const error = new TypeError('sdk bug')
    render(
      <AppBoundary>
        <AuthBoundary>
          <Thrower error={error} />
        </AuthBoundary>
      </AppBoundary>,
    )

    expect(screen.getByText('app boundary caught it')).toBeInTheDocument()
    expect(reportError).toHaveBeenCalledWith(error, {errorBoundary: 'AuthBoundary'})
  })

  it('does not report an auth error, which the boundary renders itself', () => {
    render(
      <AppBoundary>
        <AuthBoundary>
          <Thrower error={new AuthError(new Error('login failed'))} />
        </AuthBoundary>
      </AppBoundary>,
    )

    expect(reportError).not.toHaveBeenCalled()
  })
})
