import {ClientError} from '@sanity/client'
import {ConfigurationError} from '@sanity/sdk'
import {useMemo} from 'react'
import {type FallbackProps} from 'react-error-boundary'

/**
 * @alpha
 */
export type SDKErrorProps = FallbackProps

/**
 * Displays authentication error details and provides retry functionality.
 * Only handles {@link ClientError} instances - rethrows other error types.
 *
 * @alpha
 */
export function SDKError({error}: SDKErrorProps): React.ReactNode {
  if (!(error instanceof ClientError || error instanceof ConfigurationError)) {
    throw error
  }

  // const authState = useAuthState()

  // const authErrorMessage = error.message
  // const [authErrorMessage, setAuthErrorMessage] = useState(error.message)

  const sdkErrorMessage = useMemo(() => {
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
        <h2 className="sc-login-error__title">Configuration Error</h2>
        <p className="sc-login-error__description">{sdkErrorMessage}</p>
      </div>
    </div>
  )
}
