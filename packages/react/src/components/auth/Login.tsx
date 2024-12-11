import {Button, Flex, Heading, Spinner} from '@sanity/ui'
import {Suspense} from 'react'
import styled from 'styled-components'

import {useLoginUrls} from '../../hooks/auth/useLoginUrls'
import {LoginLayout, type LoginLayoutProps} from './LoginLayout'

/**
 * @alpha
 */
export interface LoginProps {
  header?: React.ReactNode
  footer?: React.ReactNode
}

const FallbackRoot = styled(Flex)`
  height: 123px;
`

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
            <FallbackRoot align="center" justify="center">
              <Spinner />
            </FallbackRoot>
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
