import {useEffect} from 'react'

import {useHandleAuthCallback} from '../../hooks/auth/useHandleAuthCallback'

/**
 * Component shown during auth callback processing that handles login completion.
 * Automatically processes the auth callback when mounted and updates the URL
 * to remove callback parameters without triggering a page reload.
 *
 * @alpha
 */
export function LoginCallback(): React.ReactNode {
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

  return null
}
