import {type PathChangeMessage, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'
import {getIsInDashboardState} from '@sanity/sdk'
import {useCallback, useEffect, useMemo, useRef} from 'react'
import {combineLatest, distinctUntilChanged, filter, map} from 'rxjs'

import {getDashboardMessageBus} from '../../dashboard/messageBus/client'
import {type ValueOf} from '../../dashboard/messageBus/topics'
import {useOptionalWindowConnection} from '../comlink/useWindowConnection'
import {useSanityInstance} from '../context/useSanityInstance'

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
 * Routes dashboard navigation into the current application.
 * Embedded applications receive Comlink messages; federated applications follow message bus state.
 *
 * @param navigateFn - Handles a relative path and its `push`, `replace`, or `pop` navigation type.
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
  const isComlinkContext = getIsInDashboardState(instance).getCurrent()
  const messageBus = isComlinkContext ? undefined : getDashboardMessageBus()
  if (!isComlinkContext && !messageBus) {
    throw new Error('useNavigate must be used inside a dashboard application')
  }
  const navigateRef = useRef(navigateFn)
  useEffect(() => {
    navigateRef.current = navigateFn
  }, [navigateFn])
  const navigate = useCallback((change: PathChangeMessage['data']) => {
    navigateRef.current(change)
  }, [])
  const onMessage = useMemo(
    () => ({
      'dashboard/v1/history/change-path': navigate,
    }),
    [navigate],
  )

  useOptionalWindowConnection<PathChangeMessage, never>(
    {name: SDK_NODE_NAME, connectTo: SDK_CHANNEL_NAME, onMessage},
    isComlinkContext,
  )

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
      .subscribe(navigate)

    return () => subscription.unsubscribe()
  }, [messageBus, navigate])
}
