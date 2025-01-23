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
      <div className="sc-login">
        <h1 className="sc-login__title">Choose login provider</h1>

        <Suspense fallback={<div className="sc-login__loading">Loading…</div>}>
          <Providers />
        </Suspense>
      </div>
    </LoginLayout>
  )
}

function Providers() {
  const loginUrls = useLoginUrls()

  return (
    <div className="sc-login-providers">
      {loginUrls.map(({title, url}) => (
        <a key={url} href={url}>
          {title}
        </a>
      ))}
    </div>
  )
}
