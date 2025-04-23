import {Card, Container} from '@sanity/ui'

import {LoginFooter} from './LoginFooter'

/**
 * @internal
 */
export interface LoginLayoutProps {
  /** Optional header content rendered at top of card */
  header?: React.ReactNode

  /** Optional footer content rendered below card. Defaults to an internal login footer */
  footer?: React.ReactNode

  /** Main content rendered in card body */
  children?: React.ReactNode
}

/**
 * Layout component for login-related screens providing consistent styling and structure.
 * Renders content in a centered card with optional header and footer sections.
 *
 * Can be used to build custom login screens for the AuthBoundary component, including:
 * - Login provider selection (LoginComponent)
 * - OAuth callback handling (CallbackComponent)
 * - Error states (LoginErrorComponent)
 *
 * @example
 * ```tsx
 * // Custom login screen using the layout
 * function CustomLogin({header, footer}: LoginLayoutProps) {
 *   return (
 *     <LoginLayout
 *       header={header}
 *       footer={footer}
 *     >
 *       <CustomLoginContent />
 *     </LoginLayout>
 *   )
 * }
 *
 * // Use with AuthBoundary
 * <AuthBoundary
 *   LoginComponent={CustomLogin}
 *   header={<Logo />}
 * >
 *   <ProtectedContent />
 * </AuthBoundary>
 * ```
 *
 * @alpha
 */
export function LoginLayout({
  children,
  footer = <LoginFooter />,
  header,
}: LoginLayoutProps): React.ReactNode {
  return (
    <Container width={0}>
      <Card shadow={1} radius={2} padding={4}>
        {header && header}

        {children && children}

        {footer}
      </Card>
    </Container>
  )
}
