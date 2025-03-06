import {SDKProvider} from '@sanity/sdk-react/components'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

import {schema} from '../schema'

const sanityConfigs = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
    schema,
  },
  {
    projectId: 'ezwd8xes',
    dataset: 'production',
    schema,
  },
]

export function ProjectInstanceWrapper(): JSX.Element {
  return (
    <SDKProvider sanityConfigs={sanityConfigs}>
      <Outlet />
    </SDKProvider>
  )
}
