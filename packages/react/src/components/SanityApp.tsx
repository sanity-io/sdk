import {type SanityConfig} from '@sanity/sdk'
import {type ReactElement, useEffect} from 'react'

import {ResourceProvider} from '../context/ResourceProvider'
import {isInIframe, isLocalUrl} from './utils'

/**
 * @public
 */
export interface SanityAppProps {
  config: SanityConfig | SanityConfig[]
  /** @deprecated use the `config` prop instead. */
  sanityConfigs?: SanityConfig[]
  children: React.ReactNode
  fallback: React.ReactNode
}

const CORE_URL = 'https://core.sanity.io'

/**
 * @public
 *
 * The SanityApp component provides your Sanity application with access to your Sanity configuration,
 * as well as application context and state which is used by the Sanity React hooks. Your application
 * must be wrapped with the SanityApp component to function properly.
 *
 * SanityApp creates a hierarchy of ResourceProviders, each providing a SanityInstance that can be
 * accessed by hooks. The first configuration in the array becomes the default instance.
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
 * const mySanityConfig = {
 *   projectId: 'my-project-id',
 *   dataset: 'production',
 * }
 *
 * // Or multiple project configurations
 * const multipleConfigs = [
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
 *     <SanityApp config={mySanityConfig} fallback={<LoadingSpinner />}>
 *       <MyAppRoot />
 *     </SanityApp>
 *   )
 * }
 * ```
 */
export function SanityApp({children, fallback, ...props}: SanityAppProps): ReactElement {
  const _config = props.config ?? props.sanityConfigs ?? []
  // reverse because we want the first config to be the default, but the
  // ResourceProvider nesting makes the last one the default
  const configs = (Array.isArray(_config) ? _config : [_config]).reverse()

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined

    if (!isInIframe() && !isLocalUrl(window)) {
      // If the app is not running in an iframe and is not a local url, redirect to core.
      timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('Redirecting to core', CORE_URL)
        window.location.replace(CORE_URL)
      }, 1000)
    }
    return () => clearTimeout(timeout)
  }, [])

  // Create a nested structure of ResourceProviders for each config
  const createNestedProviders = (index: number): ReactElement => {
    if (index >= configs.length) {
      return children as ReactElement
    }

    return (
      <ResourceProvider {...configs[index]} fallback={fallback}>
        {createNestedProviders(index + 1)}
      </ResourceProvider>
    )
  }

  return createNestedProviders(0)
}
