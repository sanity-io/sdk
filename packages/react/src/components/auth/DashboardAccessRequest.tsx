import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {useEffect} from 'react'

import {useWindowConnection} from '../../hooks/comlink/useWindowConnection'

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
export function DashboardAccessRequest({projectId}: DashboardAccessRequestProps): null {
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
