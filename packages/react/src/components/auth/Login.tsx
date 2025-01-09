import {Button, Flex, Heading, Spinner} from '@sanity/ui'
import {type JSX, Suspense} from 'react'

import {useLoginUrls} from '../../hooks/auth/useLoginUrls'
import {LoginLayout, type LoginLayoutProps} from './LoginLayout'

/**
 * Login component that displays available authentication providers.
 * Renders a list of login options with a loading fallback while providers load.
 *
 * @alpha
 */
export function Login({header, footer}: LoginLayoutProps): JSX.Element {
  return (
    <LoginLayout header={header} footer={footer}>
      <Flex direction="column" gap={4}>
        <Heading as="h1" size={1} align="center">
          Choose login provider
        </Heading>

        <Suspense
          fallback={
            <Flex align="center" justify="center" style={{height: '123px'}}>
              <Spinner />
            </Flex>
          }
        >
          <Providers />
        </Suspense>
      </Flex>
    </LoginLayout>
  )
}

function Providers() {
  const loginUrls = useLoginUrls()

  return (
    <Flex direction="column" gap={3}>
      {loginUrls.map(({title, url}) => (
        <Button key={url} text={title} as="a" href={url} mode="ghost" />
      ))}
    </Flex>
  )
}
