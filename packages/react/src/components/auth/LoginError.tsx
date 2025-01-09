import {Button, Flex, Text} from '@sanity/ui'
import {useCallback} from 'react'
import {type FallbackProps} from 'react-error-boundary'

import {useLogOut} from '../../hooks/auth/useLogOut'
import {AuthError} from './AuthError'
import {LoginLayout, type LoginLayoutProps} from './LoginLayout'

/**
 * @alpha
 */
export type LoginErrorProps = FallbackProps & LoginLayoutProps

/**
 * Displays authentication error details and provides retry functionality.
 * Only handles {@link AuthError} instances - rethrows other error types.
 *
 * @alpha
 */
export function LoginError({
  error,
  resetErrorBoundary,
  header,
  footer,
}: LoginErrorProps): React.ReactNode {
  if (!(error instanceof AuthError)) throw error
  const logout = useLogOut()

  const handleRetry = useCallback(async () => {
    await logout()
    resetErrorBoundary()
  }, [logout, resetErrorBoundary])

  return (
    <LoginLayout header={header} footer={footer}>
      <Flex direction="column" gap={4} style={{margin: 'auto'}}>
        <Flex direction="column" gap={3}>
          <Text as="h2" align="center" weight="bold" size={3}>
            Authentication Error
          </Text>
          <Text size={1} align="center">
            Please try again or contact support if the problem persists.
          </Text>
        </Flex>
        <Button text="Retry" tone="primary" onClick={handleRetry} />
      </Flex>
    </LoginLayout>
  )
}
