import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {isDashboardEnvironment} from '@sanity/sdk/_internal'
import {useEffect} from 'react'

import {useWindowConnection} from '../../hooks/comlink/useWindowConnection'
import {useEmit} from '../../hooks/dashboard/useEmit'

interface DashboardAccessRequestProps {
  projectId: string
}

/**
 * Sends a `dashboard/v1/auth/access/request` message to the dashboard via
 * comlink so the user can request access to a project they don't belong to.
 *
 * This is intentionally isolated in its own component because
 * `useWindowConnection` suspends until a comlink node is available, which
 * never happens outside the dashboard. Callers must gate rendering on
 * `getIsInDashboardState(...).getCurrent()` and wrap this in a
 * {@link https://react.dev/reference/react/Suspense | Suspense} boundary
 * so the suspension stays local instead of bubbling up to the app shell.
 *
 * @internal
 */
export function DashboardAccessRequest({projectId}: DashboardAccessRequestProps): React.ReactNode {
  return isDashboardEnvironment() ? (
    <BusAccessRequest projectId={projectId} />
  ) : (
    <ComlinkAccessRequest projectId={projectId} />
  )
}

function ComlinkAccessRequest({projectId}: DashboardAccessRequestProps): null {
  const {fetch} = useWindowConnection({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
  })

  useEffect(() => {
    fetch('dashboard/v1/auth/access/request', {
      resourceType: 'project',
      resourceId: projectId,
    })
  }, [fetch, projectId])

  return null
}

function BusAccessRequest({projectId}: DashboardAccessRequestProps): null {
  const requestAccess = useEmit('access.request')

  useEffect(() => {
    requestAccess({resourceType: 'project', resourceId: projectId})
  }, [requestAccess, projectId])

  return null
}
