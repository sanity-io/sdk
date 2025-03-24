import {useHandleAuthCallback} from '@sanity/sdk-react'
import {Flex, Heading, Spinner} from '@sanity/ui'
import {useEffect} from 'react'

import {LoginLayout, type LoginLayoutProps} from './LoginLayout'

/**
/**
 * Component shown during auth callback processing that handles login completion.
 * Automatically processes the auth callback when mounted and updates the URL
 * to remove callback parameters without triggering a page reload.
 *
 * @alpha
 */
export function LoginCallback({header, footer}: LoginLayoutProps): React.ReactNode {
  const handleAuthCallback = useHandleAuthCallback()

  useEffect(() => {
    const url = new URL(location.href)
    handleAuthCallback(url.toString()).then((replacementLocation) => {
      if (replacementLocation) {
        // history API with `replaceState` is used to prevent a reload but still
        // remove the short-lived token from the URL
        history.replaceState(null, '', replacementLocation)
      }
    })
  }, [handleAuthCallback])

  return (
    <LoginLayout header={header} footer={footer}>
      <Heading as="h6" align="center">
        Logging you in…
      </Heading>
      <Flex paddingY={5} align="center" justify="center">
        <Spinner />
      </Flex>
    </LoginLayout>
  )
}
