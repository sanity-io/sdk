import {ConfigurationError} from '@sanity/sdk'
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
  if (!(error instanceof ConfigurationError)) {
    throw error
  }

  return (
    <div className="sc-login-error">
      <div className="sc-login-error__content">
        <h2 className="sc-login-error__title">Configuration Error</h2>
        <p className="sc-login-error__description">{error.message}</p>
      </div>
    </div>
  )
}
