import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/components'
import type {JSX} from 'react'
import {Outlet} from 'react-router'

import {schema} from '../schema'

const sanityInstance = createSanityInstance({
  projectId: '',
  dataset: '',
  auth: {
    authScope: 'org',
  },
  schema,
})

export function OrgInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <Outlet />
    </SanityProvider>
  )
}
