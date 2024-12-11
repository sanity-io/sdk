import {useMemo} from 'react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'

import {useAuthState} from '../../hooks/auth/useAuthState'
import {AuthError} from './AuthError'
import {Login} from './Login'
import {LoginCallback} from './LoginCallback'
import {LoginError, type LoginErrorProps} from './LoginError'
import type {LoginLayoutProps} from './LoginLayout'

/**
 * @alpha
 */
export interface AuthBoundaryProps extends LoginLayoutProps {
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
  ...layoutProps
}: AuthBoundaryProps) {
  const LoginComponentWithLayoutProps = useMemo(() => {
    return function LoginComponentWithLayoutProps(fallbackProps: FallbackProps) {
      return <LoginError {...fallbackProps} {...layoutProps} />
    }
  }, [])

  return (
    <ErrorBoundary FallbackComponent={LoginComponentWithLayoutProps}>
      <AuthSwitch {...layoutProps} />
    </ErrorBoundary>
  )
}

interface AuthSwitchProps extends LoginLayoutProps {
  LoginComponent?: React.ComponentType<LoginLayoutProps>
  CallbackComponent?: React.ComponentType<LoginLayoutProps>
}

function AuthSwitch({
  LoginComponent = Login,
  CallbackComponent = LoginCallback,
  children,
  ...props
}: AuthSwitchProps) {
  const authState = useAuthState()

  switch (authState.type) {
    case 'error': {
      throw new AuthError(authState.error)
    }
    case 'logging-in': {
      return <CallbackComponent {...props} />
    }
    case 'logged-in': {
      return children
    }
    default: {
      return <LoginComponent {...props} />
    }
  }
}
