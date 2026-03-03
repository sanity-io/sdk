import {
  DEFAULT_RESOURCE_NAME,
  type DocumentResource,
  isStudioConfig,
  type SanityConfig,
} from '@sanity/sdk'
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
   * Core configuration for the SDK instance (auth, studio, perspective).
   * Optional when `SanityApp` is rendered inside an `SDKStudioContext`
   * provider (e.g. inside Sanity Studio) — the config is derived from
   * the workspace automatically.
   */
  config?: SanityConfig
  /**
   * Named document resources for the application. The resource keyed `"default"`
   * is used automatically when no explicit resource is specified in hooks.
   */
  resources?: Record<string, DocumentResource>
  children: React.ReactNode
  /* Fallback content to show when child components are suspending. Same as the `fallback` prop for React Suspense. */
  fallback: React.ReactNode
}

const REDIRECT_URL = 'https://sanity.io/welcome'

/**
 * Derive a SanityConfig and resources map from a Studio workspace handle.
 */
function deriveFromWorkspace(workspace: StudioWorkspaceHandle): {
  config: SanityConfig
  resources: Record<string, DocumentResource>
} {
  return {
    config: {
      defaultResource: {projectId: workspace.projectId, dataset: workspace.dataset},
      studio: {
        authenticated: workspace.authenticated,
        auth: workspace.auth.token ? {token: workspace.auth.token} : undefined,
      },
    },
    resources: {
      [DEFAULT_RESOURCE_NAME]: {projectId: workspace.projectId, dataset: workspace.dataset},
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
 * The `config` prop accepts a {@link SanityConfig} object. Use the `resources` prop to declare
 * one or more named data resources for your app.
 *
 * When rendered inside a Sanity Studio that provides `SDKStudioContext`, the `config` and `resources`
 * props are optional — `SanityApp` will automatically derive them from the Studio workspace.
 *
 * When both `config` and `SDKStudioContext` are available, the explicit props take precedence.
 *
 * @category Components
 * @param props - Your Sanity configuration and the React children to render
 * @returns Your Sanity application, integrated with your Sanity configuration and application context
 *
 * @example Single project
 * ```tsx
 * import { SanityApp } from '@sanity/sdk-react'
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp
 *       resources={{
 *         default: { projectId: 'my-project-id', dataset: 'production' },
 *       }}
 *       fallback={<div>Loading…</div>}
 *     >
 *       <MyAppRoot />
 *     </SanityApp>
 *   )
 * }
 * ```
 *
 * @example Multiple resources
 * ```tsx
 * import { SanityApp } from '@sanity/sdk-react'
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp
 *       resources={{
 *         default: { projectId: 'abc123', dataset: 'production' },
 *         'blog-project': { projectId: 'def456', dataset: 'production' },
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
  resources: resourcesProp,
  ...props
}: SanityAppProps): ReactElement {
  const studioWorkspace = useContext(SDKStudioContext)

  const derived = useMemo(() => {
    if (studioWorkspace && !configProp && !resourcesProp) {
      return deriveFromWorkspace(studioWorkspace)
    }
    return null
  }, [configProp, resourcesProp, studioWorkspace])

  const resolvedConfig = useMemo<SanityConfig>(() => {
    if (configProp) {
      if (!configProp.defaultResource && resourcesProp?.[DEFAULT_RESOURCE_NAME]) {
        return {...configProp, defaultResource: resourcesProp[DEFAULT_RESOURCE_NAME]}
      }
      return configProp
    }
    if (derived) return derived.config
    return {}
  }, [configProp, derived, resourcesProp])

  const resolvedResources = useMemo<Record<string, DocumentResource>>(() => {
    if (resourcesProp) return resourcesProp
    if (derived) return derived.resources
    return {}
  }, [resourcesProp, derived])

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined
    const shouldRedirectWithoutConfig =
      configProp === undefined && !studioWorkspace && !resolvedConfig

    if (
      !isInIframe() &&
      !isLocalUrl(window) &&
      (shouldRedirectWithoutConfig || (!!resolvedConfig && !isStudioConfig(resolvedConfig)))
    ) {
      timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.warn('Redirecting to core', REDIRECT_URL)
        window.location.replace(REDIRECT_URL)
      }, 1000)
    }
    return () => clearTimeout(timeout)
  }, [configProp, resolvedConfig, studioWorkspace])

  return (
    <SDKProvider
      {...props}
      fallback={fallback}
      config={resolvedConfig}
      resources={resolvedResources}
    >
      {children}
    </SDKProvider>
  )
}
