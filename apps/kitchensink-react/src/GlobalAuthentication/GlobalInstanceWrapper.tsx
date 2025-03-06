import {createSanityInstance} from '@sanity/sdk'
import {SanityProvider} from '@sanity/sdk-react/context'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

import {schema} from '../schema'

const sanityInstance = createSanityInstance({
  projectId: '',
  dataset: '',
  schema,
})

export function GlobalInstanceWrapper(): JSX.Element {
  return (
    <SanityProvider sanityInstances={[sanityInstance]}>
      <Outlet />
    </SanityProvider>
  )
}
