import {ClientError} from '@sanity/client'
import {AuthStateType, getIsInDashboardState, shouldDeferErrorToSdk} from '@sanity/sdk'
import {
  getClientErrorApiBody,
  getClientErrorApiDescription,
  getClientErrorFromCauseChain,
  getClientErrorStatusCode,
} from '@sanity/sdk/_internal'
import {Suspense, useCallback, useEffect, useMemo, useRef} from 'react'
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
      error instanceof ClientError ||
      shouldDeferErrorToSdk(error)
    )
  )
    throw error

  const logout = useLogOut()
  const authState = useAuthState()
  const instance = useSanityInstance()
  const {
    config: {projectId},
  } = instance

  // Errors surfaced through `AuthBoundary` arrive wrapped in `AuthError`, with
  // the original `ClientError` tucked under `.cause`, and an app's own boundary
  // may add wrappers of its own before rethrowing. Walking the `cause` chain
  // structurally lets the 401/404 branches below respond to the real status
  // code, including when the app bundles a second copy of `@sanity/client` and
  // `error instanceof ClientError` is therefore false.
  const apiError = getClientErrorFromCauseChain(error)
  const statusCode = getClientErrorStatusCode(apiError)

  const isInDashboard = getIsInDashboardState(instance).getCurrent()

  const isProjectUserNotFound = shouldDeferErrorToSdk(error)

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

  // Display state is fully derived from the inputs above, so we don't need
  // to mirror it through useState/useEffect.
  const {authErrorMessage, showRetryCta} = useMemo(() => {
    let message = 'Please try again or contact support if the problem persists.'
    let retry = true

    if (statusCode !== undefined) {
      if (statusCode === 401) {
        if (isProjectUserNotFound) {
          const description = getClientErrorApiDescription(apiError)
          if (description) message = description
          retry = false
        } else if (!isInDashboard) {
          message = 'Signing you out and returning to login...'
          retry = true
        }
        // Dashboard non-projectUserNotFound 401: leave the current UI in place
        // and let ComlinkTokenRefreshProvider request a fresh token from the
        // parent window. The Retry button remains as a manual fallback.
      } else if (statusCode === 404) {
        const errorMessage = getClientErrorApiBody(apiError)?.message || ''
        message =
          errorMessage.startsWith('Session with sid') && errorMessage.endsWith('not found')
            ? 'The session ID is invalid or expired.'
            : 'The login link is invalid or expired. Please try again.'
        retry = true
      }
    }
    if (authState.type !== AuthStateType.ERROR && error instanceof ConfigurationError) {
      message = error.message
      retry = true
    }
    return {authErrorMessage: message, showRetryCta: retry}
  }, [apiError, authState, error, isInDashboard, isProjectUserNotFound, statusCode])

  // Guards against re-entering the standalone auto-logout branch below. Once
  // `logout()` flips the auth store to LOGGED_OUT, `useAuthState` emits a new
  // `authState` reference and re-runs this effect; without the ref we'd call
  // `handleRetry` again on every emission and React eventually aborts with
  // "Maximum update depth exceeded", leaving a blank page.
  const hasAutoLoggedOutRef = useRef(false)

  // Standalone apps: the token is bad and there's no parent window to mint a
  // new one, so log the user out and let `AuthBoundary`'s LOGGED_OUT effect
  // redirect to the Sanity login URL.
  useEffect(() => {
    if (
      statusCode === 401 &&
      !isProjectUserNotFound &&
      !isInDashboard &&
      !hasAutoLoggedOutRef.current
    ) {
      hasAutoLoggedOutRef.current = true
      handleRetry()
    }
  }, [handleRetry, isInDashboard, isProjectUserNotFound, statusCode])

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
