import {type ClientError} from '@sanity/client'
import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {
  AuthStateType,
  type FrameMessage,
  getIsInDashboardState,
  type NewTokenResponseMessage,
  type RequestNewTokenMessage,
  setAuthToken,
  type WindowMessage,
} from '@sanity/sdk'
import React, {type PropsWithChildren, useCallback, useEffect, useMemo, useRef} from 'react'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useWindowConnection} from '../hooks/comlink/useWindowConnection'
import {useSanityInstance} from '../hooks/context/useSanityInstance'

// Define specific message types extending the base types for clarity
type SdkParentComlinkMessage = NewTokenResponseMessage | WindowMessage // Messages received by SDK
type SdkChildComlinkMessage = RequestNewTokenMessage | FrameMessage // Messages sent by SDK

const DEFAULT_RESPONSE_TIMEOUT = 10000 // 10 seconds

/**
 * Component that handles token refresh in dashboard mode
 */
function DashboardTokenRefresh({children}: PropsWithChildren) {
  const instance = useSanityInstance()
  const isTokenRefreshInProgress = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processed401ErrorRef = useRef<unknown | null>(null)
  const authState = useAuthState()

  const clearRefreshTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const windowConnection = useWindowConnection<SdkParentComlinkMessage, SdkChildComlinkMessage>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const requestNewToken = useCallback(async () => {
    if (isTokenRefreshInProgress.current) {
      return
    }

    isTokenRefreshInProgress.current = true
    clearRefreshTimeout()

    timeoutRef.current = setTimeout(() => {
      if (isTokenRefreshInProgress.current) {
        isTokenRefreshInProgress.current = false
      }
      timeoutRef.current = null
    }, DEFAULT_RESPONSE_TIMEOUT)

    try {
      const res = await windowConnection.fetch<{token: string | null; error?: string}>(
        'dashboard/v1/auth/tokens/create',
      )
      clearRefreshTimeout()

      if (res.token) {
        setAuthToken(instance, res.token)

        // Remove the unauthorized error from the error container
        const errorContainer = document.getElementById('__sanityError')
        if (errorContainer) {
          const hasUnauthorizedError = Array.from(errorContainer.getElementsByTagName('div')).some(
            (div) =>
              div.textContent?.includes(
                'Uncaught error: Unauthorized - A valid session is required for this endpoint',
              ),
          )

          if (hasUnauthorizedError) {
            errorContainer.remove()
          }
        }
      }
      isTokenRefreshInProgress.current = false
    } catch {
      isTokenRefreshInProgress.current = false
      clearRefreshTimeout()
    }
  }, [windowConnection, clearRefreshTimeout, instance])

  useEffect(() => {
    return () => {
      clearRefreshTimeout()
    }
  }, [clearRefreshTimeout])

  useEffect(() => {
    const has401Error =
      authState.type === AuthStateType.ERROR &&
      authState.error &&
      (authState.error as ClientError)?.statusCode === 401 &&
      !isTokenRefreshInProgress.current &&
      processed401ErrorRef.current !== authState.error

    const isLoggedOut =
      authState.type === AuthStateType.LOGGED_OUT && !isTokenRefreshInProgress.current

    if (has401Error || isLoggedOut) {
      processed401ErrorRef.current =
        authState.type === AuthStateType.ERROR ? authState.error : undefined
      requestNewToken()
    } else if (
      authState.type !== AuthStateType.ERROR ||
      processed401ErrorRef.current !==
        (authState.type === AuthStateType.ERROR ? authState.error : undefined)
    ) {
      processed401ErrorRef.current = null
    }
  }, [authState, requestNewToken])

  return children
}

/**
 * This provider is used to provide the Comlink token refresh feature.
 * It is used to automatically request a new token on 401 error if enabled.
 * @public
 */
export const ComlinkTokenRefreshProvider: React.FC<PropsWithChildren> = ({children}) => {
  const instance = useSanityInstance()
  const isInDashboard = useMemo(() => getIsInDashboardState(instance).getCurrent(), [instance])
  const studioModeEnabled = instance.config.studioMode?.enabled

  if (isInDashboard || !studioModeEnabled) {
    return <DashboardTokenRefresh>{children}</DashboardTokenRefresh>
  }

  // If we're not in the dashboard or we are relying on studio auth, we don't need to do anything
  return children
}
