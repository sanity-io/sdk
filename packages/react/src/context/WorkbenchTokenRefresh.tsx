import {type ClientError} from '@sanity/client'
import {AuthStateType, setAuthToken} from '@sanity/sdk'
import React, {type PropsWithChildren, useEffect, useRef} from 'react'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useSanityInstance} from '../hooks/context/useSanityInstance'
import {
  isWorkbenchEnvironment,
  observeWorkbenchToken,
  refreshWorkbenchToken,
} from './workbenchToken'

/**
 * Keeps the SDK auth token in sync with the workbench "OS".
 *
 * When running as a federated remote inside the workbench the OS owns the
 * session, so we subscribe to its `auth.token` stream and mirror each value into
 * the auth store — a token logs us in, `null` logs us out, and later OS
 * sign-in/out propagates automatically. When a request is rejected with a 401
 * (the token expired), we ask the OS to reissue rather than tearing the session
 * down; the new token arrives back through the same subscription.
 */
function WorkbenchTokenRefresh({children}: PropsWithChildren) {
  const instance = useSanityInstance()
  const authState = useAuthState()
  const processed401ErrorRef = useRef<unknown | null>(null)

  useEffect(() => {
    const token$ = observeWorkbenchToken()
    if (!token$) return undefined
    const subscription = token$.subscribe((token) => setAuthToken(instance, token))
    return () => subscription.unsubscribe()
  }, [instance])

  useEffect(() => {
    const has401Error =
      authState.type === AuthStateType.ERROR && (authState.error as ClientError)?.statusCode === 401

    if (has401Error && processed401ErrorRef.current !== authState.error) {
      processed401ErrorRef.current = authState.error
      refreshWorkbenchToken()
    } else if (!has401Error) {
      processed401ErrorRef.current = null
    }
  }, [authState])

  return children
}

/**
 * Provides workbench OS token refresh. No-op outside the workbench, where the
 * app uses its normal auth flow.
 * @public
 */
export const WorkbenchTokenRefreshProvider: React.FC<PropsWithChildren> = ({children}) => {
  if (isWorkbenchEnvironment()) {
    return <WorkbenchTokenRefresh>{children}</WorkbenchTokenRefresh>
  }

  return children
}
