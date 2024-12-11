import {Flex, Spinner, Text} from '@sanity/ui'
import {useEffect} from 'react'
import styled from 'styled-components'

import {useHandleCallback} from '../../hooks/auth/useHandleCallback'
import {LoginLayout, type LoginLayoutProps} from './LoginLayout'

const StyledFlex = styled(Flex)`
  margin: auto;
`

/**
 * Component shown during auth callback processing that handles login completion.
 * Automatically processes the auth callback when mounted and updates the URL
 * to remove callback parameters without triggering a page reload.
 *
 * @alpha
 */
export function LoginCallback({header, footer}: LoginLayoutProps) {
  const handleCallback = useHandleCallback()

  useEffect(() => {
    const url = new URL(location.href)
    handleCallback(url.toString()).then((replacementLocation) => {
      if (replacementLocation) {
        // history API with `replaceState` is used to prevent a reload but still
        // remove the short-lived token from the URL
        history.replaceState(null, '', replacementLocation)
      }
    })
  }, [])

  return (
    <LoginLayout header={header} footer={footer}>
      <StyledFlex direction="column" justify="center" align="center" gap={4}>
        <Text size={1}>Logging you in…</Text>
        <Spinner size={4} />
      </StyledFlex>
    </LoginLayout>
  )
}
