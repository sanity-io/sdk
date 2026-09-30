import {SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {getDashboardMessageBus} from '@sanity/sdk/_internal'
import {type MessageBus} from '@sanity/sdk/dashboard'
import {useEffect} from 'react'

import {useWindowConnection} from '../../hooks/comlink/useWindowConnection'
import {useSanityInstance} from '../../hooks/context/useSanityInstance'

interface DashboardAccessRequestProps {
  projectId: string
}

/**
 * Asks the dashboard to show its access request prompt for a project the user
 * doesn't belong to: `access.request` over the message bus when this instance
 * is connected to one, `dashboard/v1/auth/access/request` over comlink otherwise.
 *
 * This is intentionally isolated in its own component because
 * `useWindowConnection` suspends until a comlink node is available, which
 * never happens outside the dashboard. Callers must gate rendering on being
 * in a dashboard and wrap this in a
 * {@link https://react.dev/reference/react/Suspense | Suspense} boundary
 * so the suspension stays local instead of bubbling up to the app shell.
 *
 * @internal
 */
export function DashboardAccessRequest({projectId}: DashboardAccessRequestProps): React.ReactNode {
  const messageBus = getDashboardMessageBus(useSanityInstance())
  return messageBus ? (
    <BusAccessRequest messageBus={messageBus} projectId={projectId} />
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

function BusAccessRequest({
  messageBus,
  projectId,
}: DashboardAccessRequestProps & {messageBus: MessageBus}): null {
  useEffect(() => {
    messageBus.emit('access.request', {resourceType: 'project', resourceId: projectId})
  }, [messageBus, projectId])

  return null
}
