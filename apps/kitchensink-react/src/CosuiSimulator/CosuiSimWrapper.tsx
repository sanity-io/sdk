import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {type JSX, useMemo} from 'react'
import {Outlet} from 'react-router'

import {PageLayout} from '../components/PageLayout'

export function CosuiSimWrapper({token}: {token?: string}): JSX.Element {
  const sanityInstance = useMemo(() => {
    return createSanityInstance({
      projectId: 'ppsg7ml5',
      dataset: 'test',
      auth: {
        token,
      },
    })
  }, [token])

  if (token) {
    return (
      <SanityProvider sanityInstance={sanityInstance}>
        <Outlet />
      </SanityProvider>
    )
  }

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
