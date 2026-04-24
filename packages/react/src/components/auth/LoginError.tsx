import {ClientError} from '@sanity/client'
import {
  AuthStateType,
  getClientErrorApiBody,
  getClientErrorApiDescription,
  getIsInDashboardState,
  isProjectUserNotFoundClientError,
} from '@sanity/sdk'
import {Suspense, useCallback, useEffect, useRef, useState} from 'react'
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

  // Errors surfaced through `AuthBoundary` arrive wrapped in `AuthError`, with
  // the original `ClientError` tucked under `.cause`. Unwrapping it here lets
  // the 401/404 branches below respond to the real status code instead of
  // silently skipping because `error instanceof ClientError` is false.
  const clientError: ClientError | null =
    error instanceof ClientError
      ? error
      : error instanceof AuthError && error.cause instanceof ClientError
        ? error.cause
        : null

  const isInDashboard = getIsInDashboardState(instance).getCurrent()

  const isProjectUserNotFound =
    !!clientError && clientError.statusCode === 401 && isProjectUserNotFoundClientError(clientError)

  // The dashboard access request flow relies on a comlink connection to the
  // parent window. In standalone apps that connection never materializes, so
  // we must skip it entirely to avoid suspending forever on the parent's
  // Suspense boundary. Resolving to the projectId (or null) here lets the JSX
  // render the child with a single non-null guard.
  const dashboardAccessProjectId =
    isProjectUserNotFound && projectId && isInDashboard ? projectId : null

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  // Guards against re-entering the standalone auto-logout branch below. Once
  // `logout()` flips the auth store to LOGGED_OUT, `useAuthState` emits a new
  // `authState` reference and re-runs this effect; without the ref we'd call
  // `handleRetry` again on every emission and React eventually aborts with
  // "Maximum update depth exceeded", leaving a blank page.
  const hasAutoLoggedOutRef = useRef(false)

  useEffect(() => {
    if (clientError) {
      if (clientError.statusCode === 401) {
        if (isProjectUserNotFound) {
          const description = getClientErrorApiDescription(clientError)
          if (description) setAuthErrorMessage(description)
          setShowRetryCta(false)
        } else if (!isInDashboard && !hasAutoLoggedOutRef.current) {
          // Standalone apps: the token is bad and there's no parent window to
          // mint a new one, so log the user out and let `AuthBoundary`'s
          // LOGGED_OUT effect redirect to the Sanity login URL. The brief
          // visible message below gives the user context during the redirect
          // and keeps a Retry affordance in case the logout request hiccups.
          hasAutoLoggedOutRef.current = true
          setAuthErrorMessage('Signing you out and returning to login...')
          setShowRetryCta(true)
          handleRetry()
        }
        // Dashboard non-projectUserNotFound 401: leave the current UI in place
        // and let ComlinkTokenRefreshProvider request a fresh token from the
        // parent window. The Retry button remains as a manual fallback.
      } else if (clientError.statusCode === 404) {
        const errorMessage = getClientErrorApiBody(clientError)?.message || ''
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
  }, [authState, handleRetry, error, clientError, isInDashboard, isProjectUserNotFound])

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
