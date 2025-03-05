import {SDKProvider} from '@sanity/sdk-react/components'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

import {schema} from '../schema'

const sanityConfig = {
  projectId: 'ppsg7ml5',
  dataset: 'test',
  schema,
}

export function ProjectInstanceWrapper(): JSX.Element {
  return (
    <SDKProvider sanityConfig={sanityConfig}>
      <Outlet />
    </SDKProvider>
  )
}
