import {useEffect} from 'react'

import {useHandleAuthCallback} from '../../hooks/auth/useHandleAuthCallback'

/** Every `key=value` in `subset` is present with the same value in `superset`. */
function isSubset(subset: URLSearchParams, superset: URLSearchParams): boolean {
  return [...subset].every(([key, value]) => superset.get(key) === value)
}

/**
 * Whether `next` is `current` with callback params removed and nothing added.
 * Core returns such a URL when there is nowhere else to go; anything additive
 * (a path, query or hash the current URL lacks) is a destination to navigate to.
 */
function onlyStripsParams(next: URL, current: URL): boolean {
  return (
    next.pathname === current.pathname &&
    isSubset(next.searchParams, current.searchParams) &&
    isSubset(new URLSearchParams(next.hash.slice(1)), new URLSearchParams(current.hash.slice(1)))
  )
}

/**
 * Component shown during auth callback processing that handles login completion.
 * Automatically processes the auth callback when mounted and updates the URL
 * to remove callback parameters without triggering a page reload. When the
 * callback resolves to a different location (the OAuth flow returns the user
 * to where they started), a real navigation is performed instead so the app's
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
      // Core only returns same-origin locations; guard here too since this is
      // the code that navigates.
      if (next.origin !== url.origin) return
      if (onlyStripsParams(next, url)) {
        // Routers do not observe replaceState, which is fine: nothing they
        // care about changed.
        history.replaceState(null, '', replacementLocation)
      } else {
        location.replace(replacementLocation)
      }
    })
  }, [handleAuthCallback])

  return null
}
