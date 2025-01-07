import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import {useWindowConnection} from '@sanity/sdk-react/hooks'
import {useMemo, useState} from 'react'
import {Outlet} from 'react-router'

import {PageLayout} from '../components/PageLayout'

interface ReceiveMessage {
  type: 'SET_TOKEN'
  data: {
    token: string
  }
  response?: undefined
}

interface SendMessage {
  type: 'TOKEN_RECEIVED'
  data: {
    success: boolean
  }
  response?: undefined
}

export function CosuiSimWrapper(): JSX.Element {
  const [token, setToken] = useState<string>()
  const sanityInstance = useMemo(
    () =>
      createSanityInstance({
        projectId: 'ppsg7ml5',
        dataset: 'test',
        auth: {token},
      }),
    [token],
  )

  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <CosuiSimInner token={token} onTokenUpdate={setToken} />
    </SanityProvider>
  )
}

function CosuiSimInner({
  token,
  onTokenUpdate,
}: {
  token?: string
  onTokenUpdate: (newToken: string) => void
}): JSX.Element {
  const {sendMessage} = useWindowConnection<SendMessage, ReceiveMessage>({
    name: 'framed-app',
    connectTo: 'cosui',
    onMessage: {
      SET_TOKEN: (data) => {
        // probably would be better to update the token via auth store
        onTokenUpdate(data.token)
        sendMessage('TOKEN_RECEIVED', {success: true})
      },
    },
  })

  if (!token) {
    return (
      <PageLayout
        title="Loading COSUi App"
        subtitle="Explore authentication examples and components"
        homePath="/cosui-simulator"
        homeText="COSUi Simulator Home"
        hideNav
      >
        <p>Waiting for token...</p>
      </PageLayout>
    )
  }

  return <Outlet />
}
