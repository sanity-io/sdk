import {isStudioConfig, type SanityConfig} from '@sanity/sdk'
import {type ReactElement, useContext, useEffect, useMemo} from 'react'

import {SDKStudioContext, type StudioWorkspaceHandle} from '../context/SDKStudioContext'
import {SDKProvider} from './SDKProvider'
import {isInIframe, isLocalUrl} from './utils'

/**
 * @public
 * @category Types
 */
export interface SanityAppProps {
  /**
   * One or more SanityConfig objects. Each config should declare its data
   * sources via the `sources` field. Optional when `SanityApp` is rendered
   * inside an `SDKStudioContext` provider (e.g. inside Sanity Studio) — the
   * config is derived from the workspace automatically.
   */
  config?: SanityConfig | SanityConfig[]
  children: React.ReactNode
  /* Fallback content to show when child components are suspending. Same as the `fallback` prop for React Suspense. */
  fallback: React.ReactNode
}

const REDIRECT_URL = 'https://sanity.io/welcome'

/**
 * Derive a SanityConfig from a Studio workspace handle.
 * Maps the workspace's projectId, dataset, and reactive auth token into
 * the SDK's config shape using a named `"default"` source.
 */
function deriveConfigFromWorkspace(workspace: StudioWorkspaceHandle): SanityConfig {
  return {
    sources: {
      default: {projectId: workspace.projectId, dataset: workspace.dataset},
    },
    studio: {
      authenticated: workspace.authenticated,
      auth: workspace.auth.token ? {token: workspace.auth.token} : undefined,
    },
  }
}

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
 * @example Single project with named sources
 * ```tsx
 * import { SanityApp } from '@sanity/sdk-react'
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp
 *       config={{
 *         sources: {
 *           default: { projectId: 'my-project-id', dataset: 'production' },
 *         },
 *       }}
 *       fallback={<div>Loading…</div>}
 *     >
 *       <MyAppRoot />
 *     </SanityApp>
 *   )
 * }
 * ```
 *
 * @example Multiple sources
 * ```tsx
 * import { SanityApp } from '@sanity/sdk-react'
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp
 *       config={{
 *         sources: {
 *           default: { projectId: 'abc123', dataset: 'production' },
 *           'blog-project': { projectId: 'def456', dataset: 'production' },
 *         },
 *       }}
 *       fallback={<div>Loading…</div>}
 *     >
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

  // Derive config: explicit config takes precedence, then Studio context
  const resolvedConfig = useMemo(() => {
    if (configProp) return configProp
    if (studioWorkspace) return deriveConfigFromWorkspace(studioWorkspace)
    return []
  }, [configProp, studioWorkspace])

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined
    const primaryConfig = Array.isArray(resolvedConfig) ? resolvedConfig[0] : resolvedConfig
    const shouldRedirectWithoutConfig =
      configProp === undefined && !studioWorkspace && !primaryConfig

    if (
      !isInIframe() &&
      !isLocalUrl(window) &&
      (shouldRedirectWithoutConfig || (!!primaryConfig && !isStudioConfig(primaryConfig)))
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
