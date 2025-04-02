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
  if (!(error instanceof AuthError)) throw error
  const logout = useLogOut()

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  return (
    <div className="sc-login-error">
      <div className="sc-login-error__content">
        <h2 className="sc-login-error__title">Authentication Error</h2>
        <p className="sc-login-error__description">
          Please try again or contact support if the problem persists.
        </p>
      </div>

      <button className="sc-login-error__button" onClick={handleRetry}>
        Retry
      </button>
    </div>
  )
}
