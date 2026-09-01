import {type ClientError} from '@sanity/client'
import {AuthStateType, setAuthToken} from '@sanity/sdk'
import React, {type PropsWithChildren, useEffect, useRef} from 'react'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {
  isDashboardEnvironment,
  observeDashboardToken,
  refreshDashboardToken,
} from './dashboardToken'

/**
 * Keeps the SDK auth token in sync with the dashboard "OS".
 *
 * When running as a federated remote inside the dashboard the OS owns the
 * session, so we subscribe to its `auth.token` stream and mirror each value into
 * the auth store — a token logs us in, `null` logs us out, and later OS
 * sign-in/out propagates automatically. When a request is rejected with a 401
 * (the token expired), we ask the OS to reissue rather than tearing the session
 * down; the new token arrives back through the same subscription.
 */
function DashboardTokenRefresh({children}: PropsWithChildren) {
  const instance = useSanityInstance()
  const authState = useAuthState()
  const processed401ErrorRef = useRef<unknown | null>(null)

  useEffect(() => {
    const token$ = observeDashboardToken()
    if (!token$) return undefined
    const subscription = token$.subscribe((token) => setAuthToken(instance, token))
    return () => subscription.unsubscribe()
  }, [instance])

  useEffect(() => {
    const has401Error =
      authState.type === AuthStateType.ERROR && (authState.error as ClientError)?.statusCode === 401

    if (has401Error && processed401ErrorRef.current !== authState.error) {
      processed401ErrorRef.current = authState.error
      refreshDashboardToken()
    } else if (!has401Error) {
      processed401ErrorRef.current = null
    }
  }, [authState])

  return children
}

/**
 * Authenticates the SDK with the Sanity Dashboard's session when the app runs
 * inside the dashboard.
 *
 * The dashboard owns the session there: this provider subscribes to the token
 * the dashboard issues, writes each new value into the SDK's auth store (where
 * SDK hooks read it from), and asks the dashboard for a fresh token when a
 * request fails with a 401. Outside the dashboard it renders children
 * unchanged and the app's normal auth flow applies.
 *
 * @remarks
 * `AuthBoundary` mounts this automatically, so most apps never need it
 * directly. Mount it yourself only when your app runs inside the dashboard
 * without `AuthBoundary` — that is, the app renders its own loading and error
 * UI instead of the SDK's login flow — but still uses SDK hooks such as
 * `useQuery`, which need the dashboard's token in the auth store to
 * authenticate their requests.
 *
 * Mount it once, inside the provider that creates the Sanity instance whose
 * store should receive the token.
 *
 * @example
 * ```tsx
 * import {DashboardTokenRefreshProvider, ResourceProvider} from '@sanity/sdk-react'
 *
 * function EmbeddedApp() {
 *   return (
 *     <ResourceProvider fallback={<Loading />}>
 *       <DashboardTokenRefreshProvider>
 *         <App />
 *       </DashboardTokenRefreshProvider>
 *     </ResourceProvider>
 *   )
 * }
 * ```
 *
 * @public
 */
export const DashboardTokenRefreshProvider: React.FC<PropsWithChildren> = ({children}) => {
  if (isDashboardEnvironment()) {
    return <DashboardTokenRefresh>{children}</DashboardTokenRefresh>
  }

  return children
}
