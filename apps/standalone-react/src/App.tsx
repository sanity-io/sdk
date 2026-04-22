import {SDKProvider} from '@sanity/sdk-react'
import {type JSX, Suspense} from 'react'

import {AuthDevControls} from './AuthDevControls'
import {CurrentUserCard} from './CurrentUserCard'
import {Fallback} from './Fallback'
import {devConfigs} from './sanityConfigs'

export default function App(): JSX.Element {
  return (
    <>
      <header>
        <h1>SDK Standalone (React)</h1>
        <p>
          Minimal <code>SDKProvider</code> example running outside the Sanity Dashboard and without
          a Sanity Studio. The auth dev tools below let you poke at the stored token to exercise
          login, logout, and error flows.
        </p>
      </header>

      <AuthDevControls />

      <SDKProvider fallback={<Fallback />} config={devConfigs}>
        <Suspense fallback={<Fallback />}>
          <CurrentUserCard />
        </Suspense>
      </SDKProvider>
    </>
  )
}
