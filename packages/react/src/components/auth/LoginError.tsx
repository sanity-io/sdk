import {ClientError} from '@sanity/client'
import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {
  AuthStateType,
  getClientErrorApiBody,
  getClientErrorApiDescription,
  isProjectUserNotFoundClientError,
} from '@sanity/sdk'
import {useCallback, useEffect, useState} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {useAuthState} from '../../hooks/auth/useAuthState'
import {useLogOut} from '../../hooks/auth/useLogOut'
import {useWindowConnection} from '../../hooks/comlink/useWindowConnection'
import {useSanityInstance} from '../../hooks/context/useSanityInstance'
import {Error} from '../errors/Error'
import {AuthError} from './AuthError'
import {ConfigurationError} from './ConfigurationError'
/**
 * @alpha
 */
export type LoginErrorProps = FallbackProps

/**
 * Displays authentication error details and provides retry functionality.
 * Only handles {@link AuthError} instances - rethrows other error types.
 *
 * @alpha
 */
export function LoginError({error, resetErrorBoundary}: LoginErrorProps): React.ReactNode {
  if (
    !(
      error instanceof AuthError ||
      error instanceof ConfigurationError ||
      error instanceof ClientError
    )
  )
    throw error

  const logout = useLogOut()
  const authState = useAuthState()
  const {
    config: {projectId},
  } = useSanityInstance()

  const [authErrorMessage, setAuthErrorMessage] = useState(
    'Please try again or contact support if the problem persists.',
  )
  const [showRetryCta, setShowRetryCta] = useState(true)

  /**
   * TODO: before merge update message-protocol package to include the new message type
   */
  const {fetch} = useWindowConnection({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  useEffect(() => {
    if (error instanceof ClientError) {
      if (error.statusCode === 401) {
        // Surface a friendly message for projectUserNotFoundError (do not logout/refresh)
        if (isProjectUserNotFoundClientError(error)) {
          const description = getClientErrorApiDescription(error)
          if (description) setAuthErrorMessage(description)
          setShowRetryCta(false)
          /**
           * Handoff to dashboard to enable the request access flow for the project.
           */
          fetch('dashboard/v1/auth/access/request', {
            resourceType: 'project',
            resourceId: projectId,
          })
        } else {
          setShowRetryCta(true)
          handleRetry()
        }
      } else if (error.statusCode === 404) {
        const errorMessage = getClientErrorApiBody(error)?.message || ''
        if (errorMessage.startsWith('Session with sid') && errorMessage.endsWith('not found')) {
          setAuthErrorMessage('The session ID is invalid or expired.')
        } else {
          setAuthErrorMessage('The login link is invalid or expired. Please try again.')
        }
        setShowRetryCta(true)
      }
    }
    if (authState.type !== AuthStateType.ERROR && error instanceof ConfigurationError) {
      setAuthErrorMessage(error.message)
      setShowRetryCta(true)
    }
  }, [authState, handleRetry, error, fetch, projectId])

  return (
    <Error
      heading={error instanceof AuthError ? 'Authentication Error' : 'Configuration Error'}
      description={authErrorMessage}
      cta={
        showRetryCta
          ? {
              text: 'Retry',
              onClick: handleRetry,
            }
          : undefined
      }
    />
  )
}
