import {type Message, type Node} from '@sanity/comlink'
import {type PathChangeMessage, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {getNodeState} from '@sanity/sdk/comlink'
import {useEffect, useMemo, useSyncExternalStore} from 'react'
import {combineLatest, distinctUntilChanged, filter, firstValueFrom, map} from 'rxjs'

import {getDashboardMessageBus} from '../../dashboard/messageBus/client'
import {type ValueOf} from '../../dashboard/messageBus/topics'
import {useSanityInstance} from '../context/useSanityInstance'

const getNoNode = () => undefined
const subscribeToNoNode = () => () => {}

type NavigationSnapshot = readonly [
  ValueOf<'navigation.location'>,
  ValueOf<'applications.foreground'>,
]

function pathChangeFromSnapshot([location, foregroundApplicationId]: NavigationSnapshot):
  | PathChangeMessage['data']
  | null {
  if (!location) return null
  const target = location.transition?.to ?? location
  if (target.appId !== foregroundApplicationId) return null
  return {
    path: target.path,
    type: location.transition?.navigationType ?? 'pop',
  }
}

/**
 * @public
 *
 * A helper hook designed to be injected into routing components for apps within the Dashboard.
 * While the Dashboard can usually handle navigation, there are special cases when you
 * are already within a target app, and need to navigate to another route inside of that app.
 *
 * For example, your user might "favorite" a document inside of your application.
 * If they click on the Dashboard favorites item in the sidebar, and are already within your application,
 * there needs to be some way for the dashboard to signal to your application to reroute to where that document was favorited.
 *
 * This hook is intended to receive those messages, and takes a function to route to the correct path.
 *
 * @param navigateFn - Function to handle navigation; should accept:
 * - `path`: a string, which will be a relative path (for example, 'my-route')
 * - `type`: 'push', 'replace', or 'pop', which will be the type of navigation to perform
 *
 * @example
 * ```tsx
 * import {useNavigate} from '@sanity/sdk-react/dashboard'
 * import {BrowserRouter, useNavigate as useRouterNavigate} from 'react-router'
 * import {Suspense} from 'react'
 *
 * function DashboardNavigationHandler() {
 *   const navigate = useRouterNavigate()
 *   useNavigate(({path, type}) => {
 *     navigate(path, {replace: type === 'replace'})
 *   })
 *   return null
 * }
 *
 * // Wrap the component with Suspense since the hook may suspend
 * function MyApp() {
 *   return (
 *     <BrowserRouter>
 *       <Suspense>
 *         <DashboardNavigationHandler />
 *       </Suspense>
 *     </BrowserRouter>
 *   )
 * }
 * ```
 */
export function useNavigate(navigateFn: (options: PathChangeMessage['data']) => void): void {
  const instance = useSanityInstance()
  const messageBus = getDashboardMessageBus()
  const nodeSource = useMemo(
    () =>
      messageBus
        ? undefined
        : getNodeState(instance, {name: SDK_NODE_NAME, connectTo: SDK_CHANNEL_NAME}),
    [instance, messageBus],
  )

  if (nodeSource && nodeSource.getCurrent() === undefined) {
    throw firstValueFrom(nodeSource.observable.pipe(filter(Boolean)))
  }

  const nodeState = useSyncExternalStore(
    nodeSource?.subscribe ?? subscribeToNoNode,
    nodeSource?.getCurrent ?? getNoNode,
  )

  useEffect(() => {
    const node = nodeState?.node as unknown as Node<Message, PathChangeMessage> | undefined
    return node?.on('dashboard/v1/history/change-path', (data) => {
      navigateFn(data)
      return undefined
    })
  }, [navigateFn, nodeState])

  useEffect(() => {
    if (!messageBus) return undefined
    const subscription = combineLatest([
      messageBus.subscribe('navigation.location'),
      messageBus.subscribe('applications.foreground'),
    ])
      .pipe(
        map(pathChangeFromSnapshot),
        filter((change): change is PathChangeMessage['data'] => change !== null),
        distinctUntilChanged((previous, current) => previous.path === current.path),
      )
      .subscribe(navigateFn)

    return () => subscription.unsubscribe()
  }, [messageBus, navigateFn])
}
