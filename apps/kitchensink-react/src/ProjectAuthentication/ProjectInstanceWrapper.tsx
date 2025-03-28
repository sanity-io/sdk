import {SDKProvider} from '@sanity/sdk-react'
import {Spinner} from '@sanity/ui'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

export function ProjectInstanceWrapper(): JSX.Element {
  return (
    <SDKProvider
      config={[
        {projectId: 'ppsg7ml5', dataset: 'test'},
        {projectId: 'ezwd8xes', dataset: 'production'},
      ]}
      fallback={<Spinner />}
    >
      <Outlet />
    </SDKProvider>
  )
}
