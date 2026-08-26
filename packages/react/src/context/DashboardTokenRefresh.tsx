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
 * Provides dashboard OS token refresh. No-op outside the dashboard, where the
 * app uses its normal auth flow.
 * @internal
 */
export const DashboardTokenRefreshProvider: React.FC<PropsWithChildren> = ({children}) => {
  if (isDashboardEnvironment()) {
    return <DashboardTokenRefresh>{children}</DashboardTokenRefresh>
  }

  return children
}
