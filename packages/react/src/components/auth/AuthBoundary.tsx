import {CorsOriginError} from '@sanity/client'
import {AuthStateType, getCorsErrorProjectId, isStudioConfig} from '@sanity/sdk'
import {useEffect, useMemo} from 'react'
import {ErrorBoundary, type FallbackProps} from 'react-error-boundary'

import {ComlinkTokenRefreshProvider} from '../../context/ComlinkTokenRefresh'
import {useAuthState} from '../../hooks/auth/useAuthState'
import {useLoginUrl} from '../../hooks/auth/useLoginUrl'
import {useVerifyOrgProjects} from '../../hooks/auth/useVerifyOrgProjects'
import {useSanityInstance} from '../../hooks/context/useSanityInstance'
import {CorsErrorComponent} from '../errors/CorsErrorComponent'
import {isInIframe} from '../utils'
import {AuthError} from './AuthError'
import {ConfigurationError} from './ConfigurationError'
import {LoginCallback} from './LoginCallback'
import {LoginError, type LoginErrorProps} from './LoginError'

// Only import bridge if we're in an iframe. This assumes that the app is
// running within SanityOS if it is in an iframe and that the bridge hasn't already been loaded
if (isInIframe() && !document.querySelector('[data-sanity-core]')) {
  const parsedUrl = new URL(window.location.href)
  const mode = new URLSearchParams(parsedUrl.hash.slice(1)).get('mode')
  const script = document.createElement('script')
  script.src =
    mode === 'core-ui--staging'
      ? 'https://core.sanity-cdn.work/bridge.js'
      : 'https://core.sanity-cdn.com/bridge.js'
  script.type = 'module'
  script.async = true
  document.head.appendChild(script)
}

/**
 * @internal
 */
export interface AuthBoundaryProps {
  /**
   * Custom component to render the login screen.
   * Receives all props. Defaults to {@link Login}.
   */
  LoginComponent?: React.ComponentType<{
    header?: React.ReactNode
    footer?: React.ReactNode
  }>

  /**
   * Custom component to render during OAuth callback processing.
   * Receives all props. Defaults to {@link LoginCallback}.
   */
  CallbackComponent?: React.ComponentType<{
    header?: React.ReactNode
    footer?: React.ReactNode
  }>

  /**
   * Custom component to render when authentication errors occur.
   * Receives error boundary props and layout props. Defaults to
   * {@link LoginError}
   */
  LoginErrorComponent?: React.ComponentType<LoginErrorProps>

  /** Header content to display */
  header?: React.ReactNode

  /**
   * The project IDs to use for organization verification.
   */
  projectIds?: string[]

  /** Footer content to display */
  footer?: React.ReactNode

  /** Protected content to render when authenticated */
  children?: React.ReactNode

  /**
   * Whether to verify that the project belongs to the organization specified in the dashboard context.
   * By default, organization verification is enabled when running in a dashboard context.
   *
   * WARNING: Disabling organization verification is NOT RECOMMENDED and may cause your application
   * to break in the future. This should never be disabled in production environments.
   */
  verifyOrganization?: boolean
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
 * @internal
 */
export function AuthBoundary({
  LoginErrorComponent = LoginError,
  ...props
}: AuthBoundaryProps): React.ReactNode {
  const FallbackComponent = useMemo(() => {
    return function LoginComponentWithLayoutProps(fallbackProps: FallbackProps) {
      if (fallbackProps.error instanceof CorsOriginError) {
        return (
          <CorsErrorComponent
            {...fallbackProps}
            projectId={getCorsErrorProjectId(fallbackProps.error)}
          />
        )
      }
      return <LoginErrorComponent {...fallbackProps} />
    }
  }, [LoginErrorComponent])

  return (
    <ComlinkTokenRefreshProvider>
      <ErrorBoundary FallbackComponent={FallbackComponent}>
        <AuthSwitch {...props} />
      </ErrorBoundary>
    </ComlinkTokenRefreshProvider>
  )
}

interface AuthSwitchProps {
  LoginComponent?: React.ComponentType<{
    header?: React.ReactNode
    footer?: React.ReactNode
  }>
  CallbackComponent?: React.ComponentType<{
    header?: React.ReactNode
    footer?: React.ReactNode
  }>
  header?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
  verifyOrganization?: boolean
  projectIds?: string[]
}

function AuthSwitch({
  CallbackComponent = LoginCallback,
  children,
  verifyOrganization = true,
  projectIds,
  ...props
}: AuthSwitchProps) {
  const authState = useAuthState()
  const instance = useSanityInstance()
  const isStudio = isStudioConfig(instance.config)
  const disableVerifyOrg =
    !verifyOrganization || isStudio || authState.type !== AuthStateType.LOGGED_IN
  const orgError = useVerifyOrgProjects(disableVerifyOrg, projectIds)

  const isLoggedOut = authState.type === AuthStateType.LOGGED_OUT && !authState.isDestroyingSession
  const loginUrl = useLoginUrl()

  useEffect(() => {
    if (isLoggedOut && !isInIframe() && !isStudio) {
      // We don't want to redirect to login if we're in the Dashboard nor in studio mode
      window.location.href = loginUrl
    }
  }, [isLoggedOut, loginUrl, isStudio])

  // Only check the error if verification is enabled
  if (verifyOrganization && orgError) {
    throw new ConfigurationError({message: orgError})
  }

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
    case AuthStateType.LOGGED_OUT: {
      return null
    }
    default: {
      // @ts-expect-error - This state should never happen
      throw new Error(`Invalid auth state: ${authState.type}`)
    }
  }
}
