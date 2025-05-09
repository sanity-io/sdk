import {ConfigurationError} from '@sanity/sdk'
import {useCallback} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {useLogOut} from '../../hooks/auth/useLogOut'
import {AuthError} from './AuthError'
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
  if (!(error instanceof AuthError || error instanceof ConfigurationError)) {
    throw error
  }

  const logout = useLogOut()
  // useAuthState()

  const authErrorMessage = error.message

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  // useEffect(() => {
  //   if (authState.type === AuthStateType.ERROR && authState.error instanceof ClientError) {
  //     if (authState.error.statusCode === 401) {
  //       handleRetry()
  //     } else if (authState.error.statusCode === 404) {
  //       const errorMessage = authState.error.response.body.message || ''
  //       if (errorMessage.startsWith('Session with sid') && errorMessage.endsWith('not found')) {
  //         setAuthErrorMessage('The session ID is invalid or expired.')
  //       } else {
  //         setAuthErrorMessage('The login link is invalid or expired. Please try again.')
  //       }
  //     }
  //   }
  //   if (authState.type !== AuthStateType.ERROR && error instanceof ConfigurationError) {
  //     setAuthErrorMessage(error.message)
  //   }
  // }, [authState, handleRetry, error])

  return (
    <div className="sc-login-error">
      <div className="sc-login-error__content">
        <h2 className="sc-login-error__title">
          {error instanceof AuthError ? 'Authentication Error' : 'Configuration Error'}
        </h2>
        <p className="sc-login-error__description">{authErrorMessage}</p>
      </div>

      <button className="sc-login-error__button" onClick={handleRetry}>
        Retry
      </button>
    </div>
  )
}
