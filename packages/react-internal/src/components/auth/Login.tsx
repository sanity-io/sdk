import {useLoginUrls} from '@sanity/sdk-react/hooks'
import {Box, Button, Flex, Heading, Spinner, Stack} from '@sanity/ui'
import {type JSX, Suspense} from 'react'

import {LoginLayout, type LoginLayoutProps} from './LoginLayout'

/**
 * Login component that displays available authentication providers.
 * Renders a list of login options with a loading fallback while providers load.
 *
 * @alpha
 * @internal
 */
export function Login({header, footer}: LoginLayoutProps): JSX.Element {
  return (
    <LoginLayout header={header} footer={footer}>
      <Heading as="h6" align="center">
        Choose login provider:
      </Heading>

      <Suspense
        fallback={
          <Box padding={5}>
            <Flex align="center" justify="center">
              <Spinner />
            </Flex>
          </Box>
        }
      >
        <Providers />
      </Suspense>
    </LoginLayout>
  )
}

function Providers() {
  const loginUrls = useLoginUrls()

  return (
    <Stack space={3} marginY={5}>
      {loginUrls.map(({title, url}) => (
        <Button
          key={url}
          as="a"
          href={url}
          mode="ghost"
          text={title}
          textAlign="center"
          fontSize={2}
        ></Button>
      ))}
    </Stack>
  )
}
