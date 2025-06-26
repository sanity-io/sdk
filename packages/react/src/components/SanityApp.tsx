import {type IntentHandlers, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, useEffect} from 'react'

import {SDKProvider} from './SDKProvider'
import {isInIframe, isLocalUrl} from './utils'

/**
 * @public
 * @category Types
 */
export interface SanityAppProps {
  /* One or more SanityConfig objects providing a project ID and dataset name */
  config: SanityConfig | SanityConfig[]
  /** @deprecated use the `config` prop instead. */
  sanityConfigs?: SanityConfig[]
  children: React.ReactNode
  /* Fallback content to show when child components are suspending. Same as the `fallback` prop for React Suspense. */
  fallback: React.ReactNode
  /* Intent handlers for processing various intent types */
  handlers?: IntentHandlers
}

const REDIRECT_URL = 'https://sanity.io/welcome'

/**
 * @public
 *
 * The SanityApp component provides your Sanity application with access to your Sanity configuration,
 * as well as application context and state which is used by the Sanity React hooks. Your application
 * must be wrapped with the SanityApp component to function properly.
 *
 * The `config` prop on the SanityApp component accepts either a single {@link SanityConfig} object, or an array of them.
 * This allows your app to work with one or more of your organization's datasets.
 *
 * @remarks
 * When passing multiple SanityConfig objects to the `config` prop, the first configuration in the array becomes the default
 * configuration used by the App SDK Hooks.
 *
 * @category Components
 * @param props - Your Sanity configuration and the React children to render
 * @returns Your Sanity application, integrated with your Sanity configuration and application context
 *
 * @example
 * ```tsx
 * import { SanityApp, type SanityConfig } from '@sanity/sdk-react'
 *
 * import MyAppRoot from './Root'
 *
 * // Single project configuration
 * const mySanityConfig: SanityConfig = {
 *   projectId: 'my-project-id',
 *   dataset: 'production',
 * }
 *
 * // Or multiple project configurations
 * const multipleConfigs: SanityConfig[] = [
 *   // Configuration for your main project. This will be used as the default project for hooks.
 *   {
 *     projectId: 'marketing-website-project',
 *     dataset: 'production',
 *   },
 *   // Configuration for a separate blog project
 *   {
 *     projectId: 'blog-project',
 *     dataset: 'production',
 *   },
 *   // Configuration for a separate ecommerce project
 *   {
 *     projectId: 'ecommerce-project',
 *     dataset: 'production',
 *   }
 * ]
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp config={mySanityConfig} fallback={<div>Loading…</div>}>
 *       <MyAppRoot />
 *     </SanityApp>
 *   )
 * }
 * ```
 */
export function SanityApp({
  children,
  fallback,
  config = [],
  handlers,
  ...props
}: SanityAppProps): ReactElement {
  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined
    const primaryConfig = Array.isArray(config) ? config[0] : config

    if (!isInIframe() && !isLocalUrl(window) && !primaryConfig?.studioMode?.enabled) {
      // If the app is not running in an iframe and is not a local url, redirect to core.
      timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('Redirecting to core', REDIRECT_URL)
        window.location.replace(REDIRECT_URL)
      }, 1000)
    }
    return () => clearTimeout(timeout)
  }, [config])

  return (
    <SDKProvider {...props} fallback={fallback} config={config} handlers={handlers}>
      {children}
    </SDKProvider>
  )
}
