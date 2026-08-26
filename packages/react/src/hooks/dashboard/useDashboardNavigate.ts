import {type PathChangeMessage, SDK_CHANNEL_NAME, SDK_NODE_NAME} from '@sanity/message-protocol'

import {useWindowConnection} from '../comlink/useWindowConnection'

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
 * import {useDashboardNavigate} from '@sanity/sdk-react'
 * import {BrowserRouter, useNavigate} from 'react-router'
 * import {Suspense} from 'react'
 *
 * function DashboardNavigationHandler() {
 *   const navigate = useNavigate()
 *   useDashboardNavigate(({path, type}) => {
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
export function useDashboardNavigate(
  navigateFn: (options: PathChangeMessage['data']) => void,
): void {
  useWindowConnection<PathChangeMessage, never>({
    name: SDK_NODE_NAME,
    connectTo: SDK_CHANNEL_NAME,
    onMessage: {
      'dashboard/v1/history/change-path': (data: PathChangeMessage['data']) => {
        navigateFn(data)
      },
    },
  })
}
