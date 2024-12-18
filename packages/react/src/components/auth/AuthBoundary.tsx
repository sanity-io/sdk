import {AuthStateType} from '@sanity/sdk'
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
  ...props
}: AuthBoundaryProps): React.ReactNode {
  const {header, footer} = props
  const FallbackComponent = useMemo(() => {
    return function LoginComponentWithLayoutProps(fallbackProps: FallbackProps) {
      return <LoginErrorComponent {...fallbackProps} header={header} footer={footer} />
    }
  }, [header, footer, LoginErrorComponent])

  return (
    <ErrorBoundary FallbackComponent={FallbackComponent}>
      <AuthSwitch {...props} />
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
    case AuthStateType.ERROR: {
      throw new AuthError(authState.error)
    }
    case AuthStateType.LOGGING_IN: {
      return <CallbackComponent {...props} />
    }
    case AuthStateType.LOGGED_IN: {
      return children
    }
    default: {
      return <LoginComponent {...props} />
    }
  }
}
