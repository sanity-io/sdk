import {SDKProvider} from '@sanity/sdk-react'
import {Spinner} from '@sanity/ui'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

const sanityConfigs = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'ezwd8xes',
    dataset: 'production',
  },
]

export function ProjectInstanceWrapper(): JSX.Element {
  return (
    <SDKProvider sanityConfigs={sanityConfigs} fallback={<Spinner />}>
      <Outlet />
    </SDKProvider>
  )
}
