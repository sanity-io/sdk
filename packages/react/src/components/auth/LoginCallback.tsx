import {useEffect} from 'react'

import {useHandleCallback} from '../../hooks/auth/useHandleCallback'
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
  }, [handleCallback])

  return (
    <LoginLayout header={header} footer={footer}>
      <div className="sc-login-callback">
        <h1 className="sc-login-callback__title">Logging you in…</h1>
        <div className="sc-login-callback__loading">Loading…</div>
      </div>
    </LoginLayout>
  )
}
