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
import React, {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react'

import {useAuthState} from '../hooks/auth/useAuthState'
import {useWindowConnection} from '../hooks/comlink/useWindowConnection'
import {useSanityInstance} from '../hooks/context/useSanityInstance'

// Define specific message types extending the base types for clarity
type SdkParentComlinkMessage = NewTokenResponseMessage | WindowMessage // Messages received by SDK
type SdkChildComlinkMessage = RequestNewTokenMessage | FrameMessage // Messages sent by SDK

/**
 * This config is used to configure the Comlink token refresh feature.
 * It is used to automatically request a new token on 401 error if enabled.
 * @public
 */
export type ComlinkTokenRefreshConfig = {
  /** Enable the Comlink token refresh feature. Defaults to false */
  enabled?: boolean
}

interface ComlinkTokenRefreshContextValue {
  requestNewToken: () => void
  isTokenRefreshInProgress: React.MutableRefObject<boolean>
  isEnabled: boolean
}

const ComlinkTokenRefreshContext = createContext<ComlinkTokenRefreshContextValue | null>(null)

const DEFAULT_RESPONSE_TIMEOUT = 10000 // 10 seconds

/**
 * This provider is used to provide the Comlink token refresh feature.
 * It is used to automatically request a new token on 401 error if enabled.
 * @public
 */
export const ComlinkTokenRefreshProvider: React.FC<
  PropsWithChildren<ComlinkTokenRefreshConfig>
> = ({
  children,
  enabled = true, // Default to enabled
}) => {
  // console.log('ComlinkTokenRefreshProvider', {enabled, comlinkName, parentName, responseTimeout})
  const instance = useSanityInstance()
  const isTokenRefreshInProgress = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processed401ErrorRef = useRef<unknown | null>(null) // Ref to track processed 401 error

  const authState = useAuthState()
  // console.log('[++++] authState type', authState.type)

  const isInDashboard = useMemo(() => getIsInDashboardState(instance).getCurrent(), [instance])
  const isDashboardComlinkEnabled = enabled && isInDashboard
  // const isDashboardComlinkEnabled = enabled
  // console.log('isDashboardComlinkEnabled:', isDashboardComlinkEnabled)

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
    // console.log('[++++] requestNewToken', {
    //   isDashboardComlinkEnabled,
    //   comlinkStatus,
    //   isTokenRefreshInProgress,
    // })
    if (!isDashboardComlinkEnabled) {
      return
    }
    // console.log(
    //   '[++++] requestNewToken: isTokenRefreshInProgress',
    //   isTokenRefreshInProgress.current,
    // )
    if (isTokenRefreshInProgress.current) {
      return
    }
    // console.log('[++++] requestNewToken: setting isTokenRefreshInProgress to true')
    isTokenRefreshInProgress.current = true
    clearRefreshTimeout()

    timeoutRef.current = setTimeout(() => {
      if (isTokenRefreshInProgress.current) {
        isTokenRefreshInProgress.current = false
      }
      timeoutRef.current = null
    }, DEFAULT_RESPONSE_TIMEOUT)

    try {
      // const messageType = 'dashboard/v1/auth/tokens/create' as const
      const res = await windowConnection.fetch<{token: string | null; error?: string}>(
        'dashboard/v1/auth/tokens/create',
      )
      // console.log('[&&&&++++] requestNewToken: res', res)
      clearRefreshTimeout()

      if (res.token) {
        // console.log('Received new token via comlink', res.token)
        setAuthToken(instance, res.token)
      }
      isTokenRefreshInProgress.current = false
    } catch {
      isTokenRefreshInProgress.current = false
      clearRefreshTimeout()
    }
  }, [isDashboardComlinkEnabled, windowConnection, clearRefreshTimeout, instance])

  const contextValue = useMemo(
    () => ({
      requestNewToken,
      isTokenRefreshInProgress,
      isEnabled: enabled,
    }),
    [requestNewToken, isTokenRefreshInProgress, enabled],
  )

  useEffect(() => {
    return () => {
      clearRefreshTimeout()
    }
  }, [clearRefreshTimeout])

  // Effect to automatically request a new token on 401 error if enabled
  useEffect(() => {
    // console.log('[-----++++] authState', authState)
    const has401Error =
      isDashboardComlinkEnabled &&
      authState.type === AuthStateType.ERROR &&
      authState.error &&
      (authState.error as ClientError)?.statusCode === 401 &&
      !isTokenRefreshInProgress.current &&
      processed401ErrorRef.current !== authState.error

    const isLoggedOut =
      isDashboardComlinkEnabled &&
      authState.type === AuthStateType.LOGGED_OUT &&
      !isTokenRefreshInProgress.current

    // console.log('[++++] has401Error', has401Error)
    // console.log('[++++] isLoggedOut', isLoggedOut)

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
  }, [authState, isDashboardComlinkEnabled, requestNewToken])

  return (
    <ComlinkTokenRefreshContext.Provider value={contextValue}>
      {children}
    </ComlinkTokenRefreshContext.Provider>
  )
}

/**
 * This hook is used to request a new token from the parent window.
 * It is used to automatically request a new token on 401 error if enabled.
 * @public
 */
export const useComlinkTokenRefresh = (): ComlinkTokenRefreshContextValue => {
  const context = useContext(ComlinkTokenRefreshContext)
  if (!context) {
    return {
      requestNewToken: () => {
        // eslint-disable-next-line no-console
        console.warn(
          'useComlinkTokenRefresh must be used within a ComlinkTokenRefreshProvider with the feature enabled.',
        )
      },
      isTokenRefreshInProgress: {current: false},
      isEnabled: false,
    }
  }
  return context
}
