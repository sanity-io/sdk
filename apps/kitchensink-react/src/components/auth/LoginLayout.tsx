import {Card, Flex} from '@sanity/ui'

import {LoginFooter} from './LoginFooter'

/**
 * @alpha
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
    <div style={{width: '100%', display: 'flex'}}>
      <Flex direction="column" gap={4} style={{width: '320px', margin: 'auto', display: 'flex'}}>
        <Card border radius={2} paddingY={4}>
          <Flex direction="column" gap={4}>
            {header && (
              <Card borderBottom paddingX={4} paddingBottom={3}>
                {header}
              </Card>
            )}

            {children && (
              <Flex paddingX={4} direction="column" style={{minHeight: '154px'}}>
                {children}
              </Flex>
            )}
          </Flex>
        </Card>

        {footer}
      </Flex>
    </div>
  )
}
