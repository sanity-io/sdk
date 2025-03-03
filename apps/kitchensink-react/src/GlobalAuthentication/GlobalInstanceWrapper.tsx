import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

import {schema} from '../schema'

const sanityInstance = createSanityInstance({
  resources: [
    {
      projectId: 'ppsg7ml5',
      dataset: 'test',
    },
  ],
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
