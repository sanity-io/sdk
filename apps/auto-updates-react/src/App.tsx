import {SanityApp, useCurrentUser} from '@sanity/sdk-react'
import {type JSX} from 'react'

function CurrentUser(): JSX.Element {
  const user = useCurrentUser()

  return <p data-testid="current-user">{user?.name}</p>
}

export default function App(): JSX.Element {
  return (
    <SanityApp fallback={<p>Loading…</p>} config={{auth: {apiHost: 'https://api.sanity.work'}}}>
      <CurrentUser />
    </SanityApp>
  )
}
