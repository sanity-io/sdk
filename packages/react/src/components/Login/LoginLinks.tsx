import {type SanityInstance, tradeTokenForSession} from '@sanity/sdk'
import {getSidUrlSearch} from '@sanity/sdk'
import {Button, Card, Container, Flex, Heading, Stack} from '@sanity/ui'
import {type ReactElement, useEffect, useState} from 'react'

import {useLoginLinks} from '../../hooks/auth/useLoginLinks'

/**
 * Component that handles Sanity authentication flow and renders login provider options
 * @public
 * @param {Object} props - Component props
 * @param {SanityInstance} props.sanityInstance - Sanity configuration instance
 * @returns {ReactElement} Rendered component
 * @remarks
 * The component handles three states:
 * 1. Loading state during token exchange
 * 2. Success state after successful authentication
 * 3. Provider selection UI when not authenticated
 * @example
 * ```tsx
 * const config = { projectId: 'your-project-id', dataset: 'production' }
 * return <LoginLinks sanityInstance={config} />
 * ```
 */
export const LoginLinks = ({sanityInstance}: {sanityInstance: SanityInstance}): ReactElement => {
  const authProviders = useLoginLinks()

  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  /**
   * Effect that handles the token exchange flow when a session ID is present in the URL
   * Attempts to exchange temporary session ID for a permanent token
   */
  useEffect(() => {
    const sidToken = getSidUrlSearch(window.location)
    if (sidToken) {
      setIsLoading(true)
      tradeTokenForSession(sidToken, sanityInstance)
        .then((tokenResponse) => {
          setToken(tokenResponse ?? null)
        })
        .finally(() => {
          setIsLoading(false)
        })
    }
  }, [])

  // Show loading state during token exchange
  if (isLoading) {
    return <div>Logging in...</div>
  }

  // Show success state after authentication
  if (token) {
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
              {authProviders.map((provider, index) => (
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
