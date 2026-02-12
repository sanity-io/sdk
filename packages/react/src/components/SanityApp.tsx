import {type DocumentSource, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, useContext, useEffect, useMemo} from 'react'

import {SDKStudioContext} from '../context/SDKStudioContext'
import {SDKProvider} from './SDKProvider'
import {isInIframe, isLocalUrl} from './utils'

/**
 * @public
 * @category Types
 */
export interface SanityAppProps {
  /**
   * One or more SanityConfig objects providing a project ID and dataset name.
   * Optional when `SanityApp` is rendered inside an `SDKStudioContext` provider
   * (e.g. inside Sanity Studio) — the config is derived from the workspace
   * automatically.
   */
  config?: SanityConfig | SanityConfig[]
  /** @deprecated use the `config` prop instead. */
  sanityConfigs?: SanityConfig[]
  sources?: Record<string, DocumentSource>
  children: React.ReactNode
  /* Fallback content to show when child components are suspending. Same as the `fallback` prop for React Suspense. */
  fallback: React.ReactNode
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
 * When rendered inside a Sanity Studio that provides `SDKStudioContext`, the `config` prop is
 * optional — `SanityApp` will automatically derive `projectId`, `dataset`, and auth from the
 * Studio workspace.
 *
 * @remarks
 * When passing multiple SanityConfig objects to the `config` prop, the first configuration in the array becomes the default
 * configuration used by the App SDK Hooks.
 *
 * When both `config` and `SDKStudioContext` are available, the explicit `config` takes precedence.
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
  config: configProp,
  ...props
}: SanityAppProps): ReactElement {
  const studioWorkspace = useContext(SDKStudioContext)

  // Derive config: explicit config takes precedence, then Studio context.
  // We destructure the workspace into primitive / stable-reference values
  // (projectId, dataset, auth.token) so the memo only recomputes when the
  // actual config inputs change — not when the Studio re-provides a workspace
  // object with the same contents but a new reference.
  const studioProjectId = studioWorkspace?.projectId
  const studioDataset = studioWorkspace?.dataset
  const studioToken = studioWorkspace?.auth.token

  const resolvedConfig = useMemo(() => {
    if (configProp) return configProp
    if (studioProjectId !== undefined && studioDataset !== undefined) {
      return {
        projectId: studioProjectId,
        dataset: studioDataset,
        studio: {
          auth: studioToken ? {token: studioToken} : undefined,
        },
      }
    }
    return []
  }, [configProp, studioProjectId, studioDataset, studioToken])

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined
    const primaryConfig = Array.isArray(resolvedConfig) ? resolvedConfig[0] : resolvedConfig
    const shouldRedirectWithoutConfig =
      configProp === undefined && !studioWorkspace && !primaryConfig

    if (
      !isInIframe() &&
      !isLocalUrl(window) &&
      (shouldRedirectWithoutConfig ||
        (!!primaryConfig && !primaryConfig.studioMode?.enabled && !primaryConfig.studio))
    ) {
      // If the app is not running in an iframe and is not a local url, redirect to core.
      timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('Redirecting to core', REDIRECT_URL)
        window.location.replace(REDIRECT_URL)
      }, 1000)
    }
    return () => clearTimeout(timeout)
  }, [configProp, resolvedConfig, studioWorkspace])

  return (
    <SDKProvider {...props} fallback={fallback} config={resolvedConfig}>
      {children}
    </SDKProvider>
  )
}
