import {AuthBoundary as PublicAuthBoundary} from '@sanity/sdk-react/components'

import {Login} from './Login'
import {LoginCallback} from './LoginCallback'
import {LoginError, type LoginErrorProps} from './LoginError'
import {type LoginLayoutProps} from './LoginLayout'

/**
 * @alpha
 */
interface AuthBoundaryProps extends LoginLayoutProps {
  /**
   * Custom component to render the login screen.
   * Receives all login layout props. Defaults to {@link Login}.
   */
  LoginComponent?: React.ComponentType<LoginLayoutProps>

  /**
   * Custom component to render during OAuth callback processing.
   * Receives all login layout props. Defaults to {@link LoginCallback}.
   */
  CallbackComponent?: React.ComponentType<LoginLayoutProps>

  /**
   * Custom component to render when authentication errors occur.
   * Receives login layout props and error boundary props. Defaults to
   * {@link LoginError}
   */
  LoginErrorComponent?: React.ComponentType<LoginErrorProps>
}

/**
 * A component that handles authentication flow and error boundaries for a
 * protected section of the application.
 *
 * @remarks
 * This component manages different authentication states and renders the
 * appropriate components based on that state.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <AuthBoundary header={<MyLogo />}>
 *       <ProtectedContent />
 *     </AuthBoundary>
 *   )
 * }
 * ```
 *
 * @alpha
 */
export function AuthBoundary({
  LoginErrorComponent = LoginError,
  LoginComponent = Login,
  CallbackComponent = LoginCallback,
  ...props
}: AuthBoundaryProps): React.ReactNode {
  return (
    <PublicAuthBoundary
      LoginErrorComponent={LoginErrorComponent}
      LoginComponent={LoginComponent}
      CallbackComponent={CallbackComponent}
      {...props}
    />
  )
}
