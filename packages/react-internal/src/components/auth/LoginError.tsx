import {useLogOut} from '@sanity/sdk-react'
import {Button, Heading, Stack, Text} from '@sanity/ui'
import {useCallback} from 'react'
import {type FallbackProps} from 'react-error-boundary'

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
      <Stack space={5} marginBottom={5}>
        <Heading as="h6" align="center">
          Authentication Error
        </Heading>
        <Text align="center">Please try again or contact support if the problem persists.</Text>
        <Button mode="ghost" onClick={handleRetry} text="Retry" fontSize={2} />
      </Stack>
    </LoginLayout>
  )
}
