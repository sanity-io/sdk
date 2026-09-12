import {useEffect} from 'react'

import {useHandleAuthCallback} from '../../hooks/auth/useHandleAuthCallback'

/**
 * Component shown during auth callback processing that handles login completion.
 * Automatically processes the auth callback when mounted and updates the URL
 * to remove callback parameters without triggering a page reload. When the
 * callback resolves to a different route (the OAuth flow returns the user to
 * where they started), a real navigation is performed instead so the app's
 * router picks it up.
 *
 * @alpha
 */
export function LoginCallback(): React.ReactNode {
  const handleAuthCallback = useHandleAuthCallback()

  useEffect(() => {
    const url = new URL(location.href)
    handleAuthCallback(url.toString()).then((replacementLocation) => {
      if (!replacementLocation) return
      const next = new URL(replacementLocation, url)
      if (next.origin === url.origin && next.pathname === url.pathname) {
        // Same document: `replaceState` strips the callback params without a
        // reload. Routers do not observe this, which is fine when only the
        // query/hash changed. ponytail: a same-path return with different app
        // query params won't re-run router search-param hooks until the next
        // navigation.
        history.replaceState(null, '', replacementLocation)
      } else {
        location.replace(replacementLocation)
      }
    })
  }, [handleAuthCallback])

  return null
}
