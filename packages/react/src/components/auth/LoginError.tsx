import {ClientError} from '@sanity/client'
import {useCallback, useEffect, useMemo} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {useLogOut} from '../../hooks/auth/useLogOut'
import {isAuthError} from '../utils'
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
  if (!(error instanceof ClientError)) {
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

  useEffect(() => {
    const needsRetry = error instanceof ClientError && isAuthError(error)
    if (needsRetry) {
      handleRetry()
    }
  }, [error, handleRetry])

  const authErrorMessage = useMemo(() => {
    const errMess = error.response.body.message || ''
    if (errMess.startsWith('Session with sid') && errMess.endsWith('not found')) {
      return 'The session ID is invalid or expired.'
    } else {
      return errMess
    }
  }, [error])

  return (
    <div className="sc-login-error">
      <div className="sc-login-error__content">
        <h2 className="sc-login-error__title">Authentication Error</h2>
        <p className="sc-login-error__description">{authErrorMessage}</p>
      </div>

      <button className="sc-login-error__button" onClick={handleRetry}>
        Retry
      </button>
    </div>
  )
}
