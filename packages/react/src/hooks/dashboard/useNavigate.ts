/* eslint-disable react-compiler/react-compiler -- the transport branch in `useNavigate` is a deliberate rules-of-hooks exception; the compiler refuses files that disable it */
import {
  type Bridge,
  type PathChangeMessage,
  SDK_CHANNEL_NAME,
  SDK_NODE_NAME,
} from '@sanity/message-protocol'
import {isDashboardEnvironment, requireDashboardMessageBus} from '@sanity/sdk/_internal'
import {type NavigationLocation, TopicError} from '@sanity/sdk/dashboard'
import {useCallback, useEffect, useEffectEvent, useRef} from 'react'
import {filter, map, pairwise} from 'rxjs'

import {useWindowConnection} from '../comlink/useWindowConnection'
import {useSanityInstance} from '../context/useSanityInstance'

type UpdateURLMessage = Bridge.Listeners.History.UpdateURLMessage

/**
 * A navigation the Dashboard asks the app to perform, or that the app reports to the Dashboard.
 * `path` is relative to the app's own route, with no leading slash (`'documents/abc'`), and may
 * carry a query string and hash.
 * @public
 */
export type DashboardNavigation = PathChangeMessage['data']

/**
 * Reports an in-app navigation to the Dashboard so the browser URL and the Dashboard's own
 * router follow the app. `type` defaults to `'push'` and only applies in the federated runtime;
 * see {@link useNavigate}.
 * @public
 */
export type NavigateToDashboardPath = (options: {path: string; type?: 'push' | 'replace'}) => void

/**
 * @public
 *
 * A helper hook designed to be injected into routing components for apps within the Dashboard.
 * It keeps the app's router and the Dashboard in two-way sync: `navigateFn` receives the
 * navigations the Dashboard asks the app to perform, and the returned function reports the app's
 * own in-app navigations back to the Dashboard so the browser URL and the Dashboard's router
 * follow along.
 *
 * A navigation the app reports is not echoed back through `navigateFn`. The returned function is
 * referentially stable.
 *
 * The two Dashboard runtimes differ:
 * - In an iframe (Comlink), inbound `type` may be `'push'`, `'replace'` or `'pop'`. Reporting is
 *   optional because the bridge already forwards the iframe's own `pushState`; a reported `type`
 *   is ignored and the host applies the URL as a `replace`.
 * - In a federated app (message bus), inbound `type` is `'push'` or `'replace'`; `'pop'` is never
 *   sent. Reporting is required because the app's router does not reach the host, and `type` is
 *   honoured. Until the Dashboard publishes the app's base path, reports are dropped with a
 *   console warning.
 *
 * @param navigateFn - Function to handle navigation; should accept:
 * - `path`: a string, which will be a relative path (for example, 'my-route')
 * - `type`: 'push', 'replace', or 'pop', which will be the type of navigation to perform
 * @returns A function the app calls to report its own in-app navigations to the Dashboard.
 *
 * @example
 * ```tsx
 * import {useNavigate} from '@sanity/sdk-react/dashboard'
 * import {useEffect} from 'react'
 * import {useLocation, useNavigate as useRouterNavigate} from 'react-router'
 *
 * function DashboardNavigationSync() {
 *   const routerNavigate = useRouterNavigate()
 *   const {pathname, search, hash} = useLocation()
 *   const navigate = useNavigate(({path, type}) => {
 *     routerNavigate(path, {replace: type === 'replace'})
 *   })
 *   useEffect(() => {
 *     navigate({path: `${pathname.slice(1)}${search}${hash}`})
 *   }, [navigate, pathname, search, hash])
 *   return null
 * }
 * ```
 */
export function useNavigate(
  navigateFn: (options: DashboardNavigation) => void,
): NavigateToDashboardPath {
  // The branch is stable: the transport is fixed for the page lifetime, so one set of hooks
  // always runs and the other never does.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- transport is fixed for the page lifetime
  if (isDashboardEnvironment()) return useBusNavigate(navigateFn)
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
    ({path}) =>
      sendMessage('dashboard/v1/bridge/listeners/history/update-url', {
        url: new URL(path, window.location.origin).href,
      }),
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
  // The path of this app's latest outbound request, used to suppress the echo of our own commit.
  const ownRequest = useRef<string | null>(null)

  useEffect(() => {
    // bus.subscribe, not useTopic: the rule needs the previous emission, and React coalesces
    // store notifications that land in one task, so a snapshot + ref could miss the
    // `{to, transition}` -> `{to, transition: null}` pair. The observable delivers every emission.
    const sub = bus
      .subscribe('navigation.location')
      .pipe(
        pairwise(),
        filter(
          (
            pair,
          ): pair is [
            NavigationLocation & {transition: NonNullable<NavigationLocation['transition']>},
            NavigationLocation & {transition: null},
          ] => {
            const [prev, curr] = pair
            return (
              curr?.transition === null &&
              curr.appId === bus.appId &&
              prev?.transition?.to.appId === bus.appId &&
              prev.transition.to.path === curr.path
            )
          },
        ),
        filter(([, curr]) => {
          // Loop suppression: any own-app host-mediated commit consumes the pending request, so
          // a request that lands elsewhere (or never lands) can't strand its path and drop a
          // later host navigation. Only the commit for our exact path is our own echo to drop.
          const suppress = curr.path === ownRequest.current
          ownRequest.current = null
          return !suppress
        }),
        map(([prev, curr]) => ({path: curr.path, type: prev.transition.navigationType})),
      )
      .subscribe((change) => navigate(change))
    return () => sub.unsubscribe()
  }, [bus])

  return useCallback<NavigateToDashboardPath>(
    ({path, type = 'push'}) => {
      // The host commits paths without a leading slash; store the same form so the echo matches.
      const own = path.replace(/^\//, '')
      ownRequest.current = own
      // A request that never landed must drop its suppression, or a later host navigation to the
      // same path would be dropped. Best-effort: never throws.
      const clearIfStale = () => {
        if (ownRequest.current === own) ownRequest.current = null
      }
      // The base path is read per call, not in render, so a host that has not published it only
      // loses outbound reporting; the inbound subscription above still installs.
      bus
        .query('applications.base-path')
        .then((base) => {
          if (!base.ok) throw new TopicError('applications.base-path')
          return bus.emit('navigation.location.update', {
            url: joinPath(base.value, own),
            history: type,
          })
        })
        .then(
          (reply) => {
            if (!reply.ok) clearIfStale()
          },
          (error) => {
            // eslint-disable-next-line no-console
            console.warn('Failed to report navigation to the Dashboard', error)
            clearIfStale()
          },
        )
    },
    [bus],
  )
}
