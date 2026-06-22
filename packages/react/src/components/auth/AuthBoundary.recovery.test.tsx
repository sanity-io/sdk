import {AuthStateType, getIsInDashboardState} from '@sanity/sdk'
import {render, screen, waitFor} from '@testing-library/react'
import {beforeEach, describe, expect, it, type Mock, vi} from 'vitest'

import {ResourceProvider} from '../../context/ResourceProvider'
import {useAuthState} from '../../hooks/auth/useAuthState'
import {AuthBoundary} from './AuthBoundary'

// NOTE: unlike AuthBoundary.test.tsx this file does NOT mock react-error-boundary
// — we want the REAL ErrorBoundary so we can observe whether it recovers when the
// auth store transitions back to LOGGED_IN (e.g. after a successful silent token
// refresh via ComlinkTokenRefresh -> setAuthToken).

vi.mock('@sanity/sdk', async () => {
  const actual = await vi.importActual('@sanity/sdk')
  return {
    ...actual,
    getIsInDashboardState: vi.fn(() => ({getCurrent: () => true})),
  }
})

vi.mock('../../hooks/auth/useAuthState', () => ({useAuthState: vi.fn()}))
vi.mock('../../hooks/auth/useLoginUrl', () => ({
  useLoginUrl: vi.fn(() => 'https://example.com/login'),
}))
vi.mock('../../hooks/auth/useVerifyOrgProjects', () => ({useVerifyOrgProjects: vi.fn(() => null)}))
vi.mock('../../hooks/auth/useLogOut', () => ({useLogOut: vi.fn(() => async () => {})}))
vi.mock('../../hooks/auth/useHandleAuthCallback', () => ({
  useHandleAuthCallback: vi.fn(() => async () => {}),
}))
vi.mock('../../hooks/comlink/useWindowConnection', () => ({
  useWindowConnection: vi.fn(() => ({fetch: vi.fn().mockResolvedValue({token: 'fresh-token'})})),
}))
// Avoid injecting the SanityOS bridge.js <script> during import.
vi.mock('../utils', () => ({isInIframe: vi.fn(() => false)}))

const mockUseAuthState = useAuthState as Mock

describe('AuthBoundary — recovery after silent token refresh (dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getIsInDashboardState as Mock).mockReturnValue({getCurrent: () => true})
  })

  it('renders the app again once the session is re-established (LOGGED_IN)', async () => {
    // 1. Session expires: a request 401s and the auth store goes to ERROR.
    mockUseAuthState.mockReturnValue({
      type: AuthStateType.ERROR,
      error: Object.assign(new Error('Unauthorized'), {statusCode: 401}),
    })

    const {rerender} = render(
      <ResourceProvider projectId="p" dataset="d" fallback={null}>
        <AuthBoundary projectIds={['p']}>
          <div>Protected Content</div>
        </AuthBoundary>
      </ResourceProvider>,
    )

    // The error boundary catches the AuthError and shows the auth-error screen.
    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    })

    // 2. ComlinkTokenRefresh fetches a fresh token from the Dashboard, setAuthToken
    //    lands it, /users/me re-fetches and the store returns to LOGGED_IN.
    mockUseAuthState.mockReturnValue({
      type: AuthStateType.LOGGED_IN,
      currentUser: null,
      token: 'fresh-token',
    })
    rerender(
      <ResourceProvider projectId="p" dataset="d" fallback={null}>
        <AuthBoundary projectIds={['p']}>
          <div>Protected Content</div>
        </AuthBoundary>
      </ResourceProvider>,
    )

    // EXPECTED (desired) behaviour: the app recovers automatically, no Retry click.
    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
    expect(screen.queryByText('Authentication Error')).not.toBeInTheDocument()
  })
})
