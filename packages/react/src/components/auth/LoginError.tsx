import {ClientError} from '@sanity/client'
import {AuthStateType} from '@sanity/sdk'
import {useCallback, useEffect, useState} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {useAuthState} from '../../hooks/auth/useAuthState'
import {useLogOut} from '../../hooks/auth/useLogOut'
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

  const [authErrorMessage, setAuthErrorMessage] = useState(
    'Please try again or contact support if the problem persists.',
  )

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  useEffect(() => {
    if (error instanceof ClientError) {
      if (error.statusCode === 401) {
        handleRetry()
      } else if (error.statusCode === 404) {
        const errorMessage = error.response.body.message || ''
        if (errorMessage.startsWith('Session with sid') && errorMessage.endsWith('not found')) {
          setAuthErrorMessage('The session ID is invalid or expired.')
        } else {
          setAuthErrorMessage('The login link is invalid or expired. Please try again.')
        }
      }
    }
    if (authState.type !== AuthStateType.ERROR && error instanceof ConfigurationError) {
      setAuthErrorMessage(error.message)
    }
  }, [authState, handleRetry, error])

  return (
    <Error
      heading={error instanceof AuthError ? 'Authentication Error' : 'Configuration Error'}
      description={authErrorMessage}
      cta={{
        text: 'Retry',
        onClick: handleRetry,
      }}
    />
  )
}
