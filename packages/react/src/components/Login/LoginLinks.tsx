import {type SanityInstance, tradeTokenForSession} from '@sanity/sdk'
import {getSidUrlSearch} from '@sanity/sdk'
import {Button, Card, Container, Flex, Heading, Stack} from '@sanity/ui'
import {type ReactElement, useEffect, useState} from 'react'

import {useLoginLinks} from '../../hooks/auth/useLoginLinks'

/**
 * A component that renders login links for Sanity
 * @public
 */
export const LoginLinks = ({sanityInstance}: {sanityInstance: SanityInstance}): ReactElement => {
  const authProviders = useLoginLinks()
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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
  }, [sanityInstance])

  if (isLoading) {
    return <div>Logging in...</div>
  }

  if (token) {
    return <div>You are logged in with token: {token}</div>
  }

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
