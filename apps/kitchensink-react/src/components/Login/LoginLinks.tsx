import {useAuthState, useHandleCallback, useLoginUrls} from '@sanity/sdk-react/hooks'
import {Button, Card, Container, Flex, Heading, Stack} from '@sanity/ui'
import {type ReactElement} from 'react'

/**
 * Component that handles Sanity authentication flow and renders login provider options
 *
 * @public
 *
 * @returns Rendered component
 *
 * @remarks
 * The component handles three states:
 * 1. Loading state during token exchange
 * 2. Success state after successful authentication
 * 3. Provider selection UI when not authenticated
 *
 * @example
 * ```tsx
 * const config = { projectId: 'your-project-id', dataset: 'production' }
 * return <LoginLinks sanityInstance={config} />
 * ```
 */
export const LoginLinks = (): ReactElement => {
  const loginUrls = useLoginUrls()
  const authState = useAuthState()
  useHandleCallback()

  if (authState.type === 'logging-in') {
    return <div>Logging in...</div>
  }

  // Show success state after authentication
  if (authState.type === 'logged-in') {
    return <div>You are logged in</div>
  }

  /**
   * Render provider selection UI
   * Uses Sanity UI components for consistent styling
   */
  return (
    <Card height="fill" overflow="auto" paddingX={4}>
      <Flex height="fill" direction="column" align="center" justify="center" paddingTop={4}>
        <Container width={0}>
          <Stack space={4}>
            <Heading align="center" size={1}>
              Choose login provider
            </Heading>

            <Stack space={2}>
              {loginUrls.map((provider, index) => (
                <Button
                  key={`${provider.url}_${index}`}
                  as="a"
                  href={provider.url}
                  mode="ghost"
                  tone="default"
                  space={3}
                  padding={3}
                  text={provider.title}
                />
              ))}
            </Stack>
          </Stack>
        </Container>
      </Flex>
    </Card>
  )
}
