import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

import {schema} from '../schema'

const sanityInstance = createSanityInstance({
  projectId: '',
  dataset: '',
  auth: {
    authScope: 'global',
  },
  schema,
})

export function GlobalInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <Outlet />
    </SanityProvider>
  )
}
