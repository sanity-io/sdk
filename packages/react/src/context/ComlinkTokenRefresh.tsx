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

const DEFAULT_COMLINK_NAME = 'sanity-sdk-iframe'
const DEFAULT_PARENT_NAME = 'sanity-dashboard-parent'
const DEFAULT_RESPONSE_TIMEOUT = 15000 // 15 seconds

export const ComlinkTokenRefreshProvider: React.FC<
  PropsWithChildren<ComlinkTokenRefreshConfig>
> = ({
  children,
  enabled = false, // Default to disabled
  comlinkName = DEFAULT_COMLINK_NAME,
  parentName = DEFAULT_PARENT_NAME,
  responseTimeout = DEFAULT_RESPONSE_TIMEOUT,
}) => {
  const instance = useSanityInstance()
  const [comlinkStatus, setComlinkStatus] = useState<ComlinkStatus>('idle')
  const isTokenRefreshInProgress = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processed401ErrorRef = useRef<unknown | null>(null) // Ref to track processed 401 error

  const authState = useAuthState()

  const isInDashboard = useMemo(() => getIsInDashboardState(instance).getCurrent(), [instance])
  const isDashboardComlinkEnabled = enabled && isInDashboard

  const clearRefreshTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const connectionOptions = useMemo(
    () =>
      isDashboardComlinkEnabled
        ? {
            name: comlinkName,
            connectTo: parentName,
            onStatus: setComlinkStatus,
            onMessage: {
              'dashboard/v1/auth/tokens/create': (data: NewTokenResponseMessage['payload']) => {
                clearRefreshTimeout()
                // Re-check isDashboardComlinkEnabled in case props/context changed
                if (!isDashboardComlinkEnabled) return

                if (data.token) {
                  setAuthToken(instance, data.token)
                }
                isTokenRefreshInProgress.current = false
              },
            },
          }
        : undefined,
    // Add isDashboardComlinkEnabled to dependency array
    [
      isDashboardComlinkEnabled,
      comlinkName,
      parentName,
      setComlinkStatus,
      clearRefreshTimeout,
      instance,
    ],
  )

  const {sendMessage} = useWindowConnection<SdkParentComlinkMessage, SdkChildComlinkMessage>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    connectionOptions as any,
  )

  const requestNewToken = useCallback(() => {
    if (!isDashboardComlinkEnabled) {
      return
    }
    if (comlinkStatus !== 'connected') {
      return
    }
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
      // Expose isDashboardComlinkEnabled instead of isEnabled?
      // Let's stick to isEnabled prop for clarity, checks happen internally.
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
    if (
      isDashboardComlinkEnabled &&
      authState.type === AuthStateType.ERROR &&
      authState.error &&
      (authState.error as ClientError)?.statusCode === 401 &&
      !isTokenRefreshInProgress.current &&
      processed401ErrorRef.current !== authState.error // Check if this specific error instance has been processed
    ) {
      // Mark this error instance as processed before requesting token
      processed401ErrorRef.current = authState.error
      requestNewToken()
    } else if (
      authState.type !== AuthStateType.ERROR ||
      processed401ErrorRef.current !== authState.error
    ) {
      // Reset if the error is no longer a 401 or a different error occurs
      processed401ErrorRef.current = null
    }
  }, [
    authState,
    isDashboardComlinkEnabled,
    requestNewToken,
    // Dependency: isTokenRefreshInProgress.current won't trigger effect, use the ref itself
    isTokenRefreshInProgress,
  ])

  return (
    <ComlinkTokenRefreshContext.Provider value={contextValue}>
      {children}
    </ComlinkTokenRefreshContext.Provider>
  )
}

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
