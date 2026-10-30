/* eslint-disable react-compiler/react-compiler -- the transport branch in `useNavigate` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {
  type Bridge,
  type PathChangeMessage,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
} from '@sanity/message-protocol'
import {isMessageBusEnvironment, requireDashboardMessageBus} from '@sanity/sdk/_internal'
import {type NavigationLocation, TopicError} from '@sanity/sdk/dashboard'
import {useCallback, useEffect, useEffectEvent, useRef} from 'react'
import {pairwise, startWith} from 'rxjs'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useSanityInstance} from '../context/useSanityInstance'

type UpdateURLMessage = Bridge.Listeners.History.UpdateURLMessage

const ignoreInbound = () => {}

/**
 * A navigation the Dashboard asks the app to perform, or that the app reports to the Dashboard.
 * `path` is relative to the app's own route, with no leading slash (`'documents/abc'`), and may
 * carry a query string and hash.
 * @public
 * @category Types
 * @category Dashboard
 */
export type DashboardNavigation = PathChangeMessage['data']

/**
 * Reports an in-app navigation to the Dashboard so the browser URL and the Dashboard's own
 * router follow the app. `type` defaults to `'push'` and only applies in the federated runtime;
 * see {@link useNavigate}.
 *
 * `scope` defaults to `'in-app'`, where `path` is relative to the app's route. With
 * `'dashboard'`, `path` is a Dashboard URL from {@link urlFor} and is navigated to as-is; only
 * the federated runtime supports it.
 * @public
 * @category Types
 * @category Dashboard
 */
export type NavigateToDashboardPath = (options: {
  path: string
  type?: 'push' | 'replace'
  scope?: 'in-app' | 'dashboard'
}) => void

/**
 * @public
 *
 * A helper hook designed to be injected into routing components for apps within the Dashboard.
 * It keeps the app's router and the Dashboard in two-way sync: `navigateFn` receives the
 * navigations the Dashboard asks the app to perform, and the returned function reports the app's
 * own in-app navigations back to the Dashboard so the browser URL and the Dashboard's router
 * follow along.
 *
 * An in-app navigation the app reports is not echoed back through `navigateFn`. A
 * dashboard-scoped one that lands in this app is, because the app's router has not moved. The
 * returned function is referentially stable.
 *
 * The two Dashboard runtimes differ:
 * - In an iframe (Comlink), inbound `type` may be `'push'`, `'replace'` or `'pop'`. Reporting is
 *   optional because the bridge already forwards the iframe's own `pushState`; a reported `type`
 *   is ignored and the host applies the URL as a `replace`. Dashboard-scoped reports are dropped
 *   with a console warning.
 * - In a federated app (message bus), inbound `type` is `'push'` or `'replace'`; `'pop'` is never
 *   sent. Reporting is required because the app's router does not reach the host, and `type` is
 *   honoured. Until the Dashboard publishes the app's base path, in-app reports are dropped with
 *   a console warning.
 *
 * @param navigateFn - Function to handle navigation; should accept:
 * - `path`: a string, which will be a relative path (for example, 'my-route')
 * - `type`: 'push', 'replace', or 'pop', which will be the type of navigation to perform
 *
 * Optional. Omit it when the app only sends the user somewhere and has no router of its own;
 * inbound navigations are then ignored. An app with its own router must pass it, or the router
 * stops following the Dashboard's back and forward navigation and links into the app.
 * @returns A function the app calls to report its own in-app navigations to the Dashboard.
 *
 * @example
 * ```tsx
 * import {useNavigate} from '@sanity/sdk-react/dashboard'
 * import {useEffect} from 'react'
 * import {useLocation, useNavigate as useRouterNavigate, useNavigationType} from 'react-router'
 *
 * function DashboardNavigationSync() {
 *   const routerNavigate = useRouterNavigate()
 *   const navigationType = useNavigationType()
 *   const {pathname, search, hash} = useLocation()
 *   const navigate = useNavigate(({path, type}) => {
 *     routerNavigate(`/${path}`, {replace: type === 'replace'})
 *   })
 *   useEffect(() => {
 *     navigate({
 *       path: `${pathname.slice(1)}${search}${hash}`,
 *       type: navigationType === 'REPLACE' ? 'replace' : 'push',
 *     })
 *   }, [navigate, navigationType, pathname, search, hash])
 *   return null
 * }
 * ```
 * @category Dashboard
 */
export function useNavigate(
  navigateFn: (options: DashboardNavigation) => void = ignoreInbound,
): NavigateToDashboardPath {
  // The branch is stable: the transport is fixed for the page lifetime, so one set of hooks
  // always runs and the other never does.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  if (isMessageBusEnvironment()) return useBusNavigate(navigateFn)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  return useComlinkNavigate(navigateFn)
}

function useComlinkNavigate(
  navigateFn: (options: DashboardNavigation) => void,
): NavigateToDashboardPath {
  const {sendMessage} = useWindowConnection<
    UpdateURLMessage | PathChangeMessage,
    PathChangeMessage
  >({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onMessage: {
      'dashboard/v1/history/change-path': (data: PathChangeMessage['data']) => {
        navigateFn(data)
      },
    },
  })

  return useCallback<NavigateToDashboardPath>(
    ({path, scope = 'in-app'}) => {
      // The host rewrites every `update-url` into this app's route, so it can't leave the app.
      if (scope === 'dashboard') {
        // eslint-disable-next-line no-console
        console.warn('Dashboard-scoped navigation is not supported in the iframe runtime', path)
        return
      }
      sendMessage('dashboard/v1/bridge/listeners/history/update-url', {
        url: new URL(path, window.location.origin).href,
      })
    },
    [sendMessage],
  )
}

function joinPath(base: string, path: string): string {
  const root = base.replace(/\/$/, '')
  return path ? `${root}/${path}` : root
}

function useBusNavigate(
  navigateFn: (options: DashboardNavigation) => void,
): NavigateToDashboardPath {
  const instance = useSanityInstance()
  const bus = requireDashboardMessageBus(instance, 'navigate')
  const navigate = useEffectEvent(navigateFn)
  // The app's path as dashboard last showed it; `undefined` before the first subscription.
  const hostPath = useRef<string | null | undefined>(undefined)
  // Where the app's router is, as the app last reported or this hook last followed.
  const appPath = useRef<string | null>(null)
  const staleReportPath = useRef<string | null>(null)

  useEffect(() => {
    const pathOf = (location: NavigationLocation | null | undefined) =>
      location?.appId === bus.appId ? location.path : null
    const locations = bus.subscribe('navigation.location')
    if (hostPath.current === undefined) hostPath.current = pathOf(locations.getCurrent())

    // Each subscription replays the current location first, which catches up on missed navigations.
    const sub = locations.pipe(startWith(null), pairwise()).subscribe(([previous, location]) => {
      const path = pathOf(location)
      if (path === null || path === hostPath.current) return

      hostPath.current = path
      if (path === appPath.current) return

      staleReportPath.current = appPath.current
      // Only effects of the current commit can still report the old path.
      queueMicrotask(() => {
        staleReportPath.current = null
      })
      appPath.current = path
      // Back and forward commit without a transition (SDK-2901); the host already moved history.
      const transition = location?.transition ?? previous?.transition
      navigate({
        path,
        type: transition?.to.appId === bus.appId ? transition.navigationType : 'replace',
      })
    })

    return () => sub.unsubscribe()
  }, [bus])

  return useCallback<NavigateToDashboardPath>(
    ({path, type = 'push', scope = 'in-app'}) => {
      const report = (url: string | Promise<string>) =>
        Promise.resolve(url)
          .then((resolved) =>
            bus.emit('navigation.location.update', {url: resolved, history: type}),
          )
          .catch((error: unknown) => {
            // eslint-disable-next-line no-console
            console.warn('Failed to report navigation to the Dashboard', error)
          })

      // A dashboard-scoped report never moved our router.
      if (scope === 'dashboard') {
        report(path)
        return
      }

      // Host paths have no leading slash.
      const reportedPath = path.replace(/^\//, '')
      // Sent before the router caught up; forwarding it would undo the host's navigation.
      if (reportedPath === staleReportPath.current) return

      appPath.current = reportedPath
      if (reportedPath === hostPath.current) return

      // The base path is read per call, not in render, so a host that has not published it only
      // loses outbound reporting; the inbound subscription above still installs.
      report(
        bus.query('applications.base-path').then((base) => {
          if (!base.ok) throw new TopicError('applications.base-path')
          return joinPath(base.value, reportedPath)
        }),
      )
    },
    [bus],
  )
}
