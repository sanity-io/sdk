import {ClientError} from '@sanity/client'
import {AuthStateType} from '@sanity/sdk'
import {
  getClientErrorApiBody,
  getProjectAccessErrorDetails,
  isDashboardEnvironment,
} from '@sanity/sdk/_internal'
import {useCallback, useEffect, useRef} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {useAuthState} from '../../hooks/auth/useAuthState'
import {useLogOut} from '../../hooks/auth/useLogOut'
import {useSanityInstance} from '../../hooks/context/useSanityInstance'
import {Error} from '../errors/Error'
import {AuthError} from './AuthError'
import {ConfigurationError} from './ConfigurationError'
import {ProjectAccessError} from './ProjectAccessError'
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

  // The signed-in account isn't a member of the project. Retrying or the
  // automatic sign-out below can't fix that, so it gets its own screen.
  const projectAccess = getProjectAccessErrorDetails(error)
  if (projectAccess) {
    return <ProjectAccessError details={projectAccess} resetErrorBoundary={resetErrorBoundary} />
  }

  return <AuthErrorScreen error={error} resetErrorBoundary={resetErrorBoundary} />
}

const DEFAULT_MESSAGE = 'Please try again or contact support if the problem persists.'

function getClientErrorMessage(clientError: ClientError, isInDashboard: boolean): string {
  if (clientError.statusCode === 401) {
    // Dashboard 401: leave the current UI in place and let
    // ComlinkTokenRefreshProvider request a fresh token from the parent
    // window. The Retry button remains as a manual fallback.
    return isInDashboard ? DEFAULT_MESSAGE : 'Signing you out and returning to login...'
  }
  if (clientError.statusCode === 404) {
    const errorMessage = getClientErrorApiBody(clientError)?.message || ''
    return errorMessage.startsWith('Session with sid') && errorMessage.endsWith('not found')
      ? 'The session ID is invalid or expired.'
      : 'The login link is invalid or expired. Please try again.'
  }
  return DEFAULT_MESSAGE
}

function AuthErrorScreen({
  error,
  resetErrorBoundary,
}: {
  error: AuthError | ConfigurationError | ClientError
  resetErrorBoundary: () => void
}): React.ReactNode {
  const logout = useLogOut()
  const authState = useAuthState()
  const instance = useSanityInstance()

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

  const isInDashboard = isDashboardEnvironment(instance)

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  // Display state is fully derived from the inputs above, so we don't need
  // to mirror it through useState/useEffect.
  const authErrorMessage =
    authState.type !== AuthStateType.ERROR && error instanceof ConfigurationError
      ? error.message
      : clientError
        ? getClientErrorMessage(clientError, isInDashboard)
        : DEFAULT_MESSAGE

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
      clientError &&
      clientError.statusCode === 401 &&
      !isInDashboard &&
      !hasAutoLoggedOutRef.current
    ) {
      hasAutoLoggedOutRef.current = true
      handleRetry()
    }
  }, [clientError, handleRetry, isInDashboard])

  return (
    <Error
      heading={error instanceof ConfigurationError ? 'Configuration Error' : 'Authentication Error'}
      description={authErrorMessage}
      cta={{text: 'Retry', onClick: handleRetry}}
    />
  )
}
