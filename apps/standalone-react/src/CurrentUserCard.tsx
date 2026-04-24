import {useAuthState, useCurrentUser} from '@sanity/sdk-react'
import {type JSX} from 'react'

export function CurrentUserCard(): JSX.Element {
  const authState = useAuthState()
  const user = useCurrentUser()

  return (
    <section
      style={{
        background: 'rgba(0, 128, 255, 0.08)',
        border: '1px solid rgba(0, 128, 255, 0.4)',
        padding: 12,
        margin: '12px 0',
        borderRadius: 6,
      }}
    >
      <p>
        <strong>Auth state:</strong> <code>{authState.type}</code>
      </p>
      <p>
        <strong>Current user:</strong> {user ? user.name : '(none)'}
      </p>
      <pre style={{margin: 0}}>{JSON.stringify(user, null, 2)}</pre>
    </section>
  )
}
