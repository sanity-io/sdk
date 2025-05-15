import {ClientError} from '@sanity/client'
import {ConfigurationError} from '@sanity/sdk'
import {useCallback, useEffect, useMemo} from 'react'
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
  if (!(error instanceof ClientError || error instanceof ConfigurationError)) {
    throw error
  }

  const logout = useLogOut()
  // const authState = useAuthState()

  // const authErrorMessage = error.message
  // const [authErrorMessage, setAuthErrorMessage] = useState(error.message)

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  const shouldHandleRetry = useMemo(() => {
    if (error instanceof ClientError) {
      return error.statusCode === 401
    }
    return false
  }, [error])

  useEffect(() => {
    if (shouldHandleRetry) {
      handleRetry()
    }
  }, [shouldHandleRetry, handleRetry])

  const authErrorMessage = useMemo(() => {
    if (!(error instanceof ClientError)) {
      return error.message
    }
    const errMess = error.response.body.message || ''
    if (errMess.startsWith('Session with sid') && errMess.endsWith('not found')) {
      return 'The session ID is invalid or expired.'
    } else {
      return 'The login link is invalid or expired. Please try again.'
    }
  }, [error])

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
