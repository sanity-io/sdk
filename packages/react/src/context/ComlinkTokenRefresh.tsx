import {type ClientError} from '@sanity/client'
import {type Status as ComlinkStatus} from '@sanity/comlink'
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
  useState,
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
  /** Unique name for this SDK iframe instance's Comlink endpoint. Defaults to 'sanity-sdk-iframe' */
  comlinkName?: string
  /** The name of the parent window's Comlink endpoint to connect to. Defaults to 'sanity-dashboard-parent' */
  parentName?: string
  /** Timeout in ms for waiting for a token response from the parent. Defaults to 15000ms */
  responseTimeout?: number
}

interface ComlinkTokenRefreshContextValue {
  requestNewToken: () => void
  isTokenRefreshInProgress: React.MutableRefObject<boolean>
  comlinkStatus: ComlinkStatus
  isEnabled: boolean
}

const ComlinkTokenRefreshContext = createContext<ComlinkTokenRefreshContextValue | null>(null)

export const DEFAULT_COMLINK_NAME = 'dashboard/nodes/sdk'
export const DEFAULT_PARENT_NAME = 'dashboard/channels/sdk'
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
  comlinkName = DEFAULT_COMLINK_NAME,
  parentName = DEFAULT_PARENT_NAME,
  responseTimeout = DEFAULT_RESPONSE_TIMEOUT,
}) => {
  // console.log('ComlinkTokenRefreshProvider', {enabled, comlinkName, parentName, responseTimeout})
  const instance = useSanityInstance()
  const [comlinkStatus, setComlinkStatus] = useState<ComlinkStatus>('idle')
  const isTokenRefreshInProgress = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processed401ErrorRef = useRef<unknown | null>(null) // Ref to track processed 401 error

  const authState = useAuthState()

  const isInDashboard = useMemo(() => getIsInDashboardState(instance).getCurrent(), [instance])
  // const isDashboardComlinkEnabled = enabled && isInDashboard
  const isDashboardComlinkEnabled = enabled || isInDashboard
  // console.log('isDashboardComlinkEnabled:', isDashboardComlinkEnabled)

  const clearRefreshTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const connectionOptions = useMemo(
    () => ({
      name: comlinkName,
      connectTo: parentName,
      onStatus: setComlinkStatus,
      onMessage: isDashboardComlinkEnabled
        ? {
            'dashboard/v1/auth/tokens/create': (data: NewTokenResponseMessage['payload']) => {
              clearRefreshTimeout()
              if (!isDashboardComlinkEnabled) return

              if (data.token) {
                // console.log('Received new token via comlink')
                setAuthToken(instance, data.token)
              }
              isTokenRefreshInProgress.current = false
            },
          }
        : {},
    }),
    [
      isDashboardComlinkEnabled,
      comlinkName,
      parentName,
      setComlinkStatus,
      clearRefreshTimeout,
      instance,
    ],
  )

  const windowConnection = useWindowConnection<SdkParentComlinkMessage, SdkChildComlinkMessage>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectionOptions as any,
  )

  const sendMessage = useMemo(() => {
    if (isDashboardComlinkEnabled && windowConnection?.sendMessage) {
      return (messageType: string) => {
        // console.log('Sending comlink message:', messageType)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        windowConnection.sendMessage(messageType as any)
      }
    }
    return () => {
      // console.log('sendMessage called but comlink is not available')
    }
  }, [isDashboardComlinkEnabled, windowConnection])

  const requestNewToken = useCallback(() => {
    // console.log('[++++] requestNewToken', {
    //   isDashboardComlinkEnabled,
    //   comlinkStatus,
    //   isTokenRefreshInProgress,
    // })
    if (!isDashboardComlinkEnabled) {
      return
    }
    // console.log('[++++] requestNewToken: comlinkStatus', comlinkStatus)
    if (comlinkStatus !== 'idle') {
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
    }, responseTimeout)

    try {
      const messageType = 'dashboard/v1/auth/tokens/create' as const
      sendMessage(messageType)
    } catch {
      isTokenRefreshInProgress.current = false
      clearRefreshTimeout()
    }
  }, [isDashboardComlinkEnabled, sendMessage, comlinkStatus, responseTimeout, clearRefreshTimeout])

  const contextValue = useMemo(
    () => ({
      requestNewToken,
      isTokenRefreshInProgress,
      comlinkStatus,
      isEnabled: enabled,
    }),
    [requestNewToken, isTokenRefreshInProgress, comlinkStatus, enabled],
  )

  useEffect(() => {
    return () => {
      clearRefreshTimeout()
    }
  }, [clearRefreshTimeout])

  // Effect to automatically request a new token on 401 error if enabled
  useEffect(() => {
    // console.log('[++++] authState', authState)
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
      comlinkStatus: 'idle',
      isEnabled: false,
    }
  }
  return context
}
