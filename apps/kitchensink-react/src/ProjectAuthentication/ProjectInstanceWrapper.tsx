import {ResourceProvider} from '@sanity/sdk-react'
import {Spinner} from '@sanity/ui'
import {type JSX} from 'react'
import {Outlet} from 'react-router'

export function ProjectInstanceWrapper(): JSX.Element {
  return (
    <ResourceProvider projectId="ezwd8xes" dataset="production" fallback={<Spinner />}>
      <ResourceProvider projectId="ppsg7ml5" dataset="test" fallback={<Spinner />}>
        <Outlet />
      </ResourceProvider>
    </ResourceProvider>
  )
}
