import {type SanityConfig} from '@sanity/sdk'
import {type ReactElement, useEffect, useState} from 'react'

import {SDKProvider} from './SDKProvider'
import {isInIframe, isLocalUrl} from './utils'

/**
 * @public
 */
export interface SanityAppProps {
  sanityConfigs: SanityConfig[]
  children: React.ReactNode
}

const CORE_URL = 'https://core.sanity.io'

/**
 * @public
 *
 * The SanityApp component provides your Sanity application with access to your Sanity configuration,
 * as well as application context and state which is used by the Sanity React hooks. Your application
 * must be wrapped with the SanityApp component to function properly.
 *
 * @param props - Your Sanity configuration and the React children to render
 * @returns Your Sanity application, integrated with your Sanity configuration and application context
 *
 * @example
 * ```tsx
 * import { SanityApp } from '@sanity/sdk-react'
 *
 * import MyAppRoot from './Root'
 *
 * // Single project configuration
 * const mySanityConfigs = [
 *   {
 *     projectId: 'my-project-id',
 *     dataset: 'production',
 *   },
 * ]
 *
 * // Or multiple project configurations
 * const multipleConfigs = [
 *   {
 *     projectId: 'marketing-website-project',
 *     dataset: 'production',
 *     // Configuration for your main project. This will be used as the default project for all hooks if no resource override is provided.
 *   },
 *   {
 *     projectId: 'blog-project',
 *     dataset: 'production',
 *     // Configuration for a separate blog project
 *   },
 *   {
 *     projectId: 'ecommerce-project',
 *     dataset: 'production',
 *     // Configuration for a separate ecommerce project
 *   }
 * ]
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp sanityConfigs={mySanityConfigs}>
 *       <MyAppRoot />
 *     </SanityApp>
 *   )
 * }
 * ```
 */
export function SanityApp({sanityConfigs, children}: SanityAppProps): ReactElement {
  const [_sanityConfigs, setSanityConfigs] = useState<SanityConfig[]>(sanityConfigs)

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined

    if (isInIframe()) {
      // When running in an iframe Content OS, we don't want to store tokens
      setSanityConfigs(
        sanityConfigs.map((sanityConfig) => ({
          ...sanityConfig,
          auth: {
            ...sanityConfig.auth,
            storageArea: undefined,
          },
        })),
      )
    } else if (!isLocalUrl(window)) {
      // If the app is not running in an iframe and is not a local url, redirect to core.
      timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('Redirecting to core', CORE_URL)
        window.location.replace(CORE_URL)
      }, 1000)
    }
    return () => clearTimeout(timeout)
  }, [sanityConfigs])

  return <SDKProvider sanityConfigs={_sanityConfigs}>{children}</SDKProvider>
}
