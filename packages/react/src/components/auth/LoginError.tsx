import {ClientError} from '@sanity/client'
import {
  AuthStateType,
  getClientErrorApiBody,
  getClientErrorApiDescription,
  getIsInDashboardState,
  isProjectUserNotFoundClientError,
} from '@sanity/sdk'
import {Suspense, useCallback, useEffect, useState} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {useAuthState} from '../../hooks/auth/useAuthState'
import {useLogOut} from '../../hooks/auth/useLogOut'
import {useSanityInstance} from '../../hooks/context/useSanityInstance'
import {Error} from '../errors/Error'
import {AuthError} from './AuthError'
import {ConfigurationError} from './ConfigurationError'
import {DashboardAccessRequest} from './DashboardAccessRequest'
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
  const instance = useSanityInstance()
  const {
    config: {projectId},
  } = instance

  const [authErrorMessage, setAuthErrorMessage] = useState(
    'Please try again or contact support if the problem persists.',
  )
  const [showRetryCta, setShowRetryCta] = useState(true)

  const isProjectUserNotFound =
    error instanceof ClientError &&
    error.statusCode === 401 &&
    isProjectUserNotFoundClientError(error)

  // The dashboard access request flow relies on a comlink connection to the
  // parent window. In standalone apps that connection never materializes, so
  // we must skip it entirely to avoid suspending forever on the parent's
  // Suspense boundary (see SDK-1318). Resolving to the projectId (or null)
  // here lets the JSX render the child with a single non-null guard.
  const dashboardAccessProjectId =
    isProjectUserNotFound && projectId && getIsInDashboardState(instance).getCurrent()
      ? projectId
      : null

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  useEffect(() => {
    if (error instanceof ClientError) {
      if (error.statusCode === 401) {
        if (isProjectUserNotFound) {
          const description = getClientErrorApiDescription(error)
          if (description) setAuthErrorMessage(description)
          setShowRetryCta(false)
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
  }, [authState, handleRetry, error, isProjectUserNotFound])

  return (
    <>
      {dashboardAccessProjectId && (
        <Suspense fallback={null}>
          <DashboardAccessRequest projectId={dashboardAccessProjectId} />
        </Suspense>
      )}
      <Error
        heading={
          error instanceof ConfigurationError ? 'Configuration Error' : 'Authentication Error'
        }
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
    </>
  )
}
