import {type JSX} from 'react'

import {clearToken, seedExpiredToken} from './seedToken'

function expireAndReload() {
  seedExpiredToken()
  window.location.reload()
}

function clearAndReload() {
  clearToken()
  window.location.reload()
}

export function AuthDevControls(): JSX.Element {
  return (
    <section>
      <h2>Auth dev tools</h2>
      <p>
        <strong>Expire token</strong> writes a stamped-looking but unauthorized value into{' '}
        <code>localStorage.__sanity_auth_token</code> and reloads. The SDK treats it as a stored
        session, so the next authenticated request 401s, which is a quick way to exercise the auth
        error / re-login paths without waiting for a real token to expire.
      </p>
      <p>
        <strong>Clear token</strong> removes the stored token and reloads, which should take you
        through the standalone login redirect to <code>www.sanity.io/login</code>.
      </p>
      <p>
        <button type="button" onClick={expireAndReload}>
          Expire token
        </button>
        <button type="button" onClick={clearAndReload}>
          Clear token and reload
        </button>
      </p>
      <p>
        <small>
          Tip: visit <code>/?expire</code> to seed an expired token on first load (before the SDK
          mounts).
        </small>
      </p>
    </section>
  )
}
