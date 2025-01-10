import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import type {JSX} from 'react'
import {Outlet} from 'react-router'

import {schema} from '../schema'

const sanityInstance = createSanityInstance({
  projectId: 'ppsg7ml5',
  dataset: 'test',
  schema,
})

export function ProjectInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <Outlet />
    </SanityProvider>
  )
}
