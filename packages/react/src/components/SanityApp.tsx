import {
  DEFAULT_SOURCE_NAME,
  type DocumentSource,
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
   * Named document sources for the application. The source keyed `"default"`
   * is used automatically when no explicit source is specified in hooks.
   */
  sources?: Record<string, DocumentSource>
  children: React.ReactNode
  /* Fallback content to show when child components are suspending. Same as the `fallback` prop for React Suspense. */
  fallback: React.ReactNode
}

const REDIRECT_URL = 'https://sanity.io/welcome'

/**
 * Derive a SanityConfig and sources map from a Studio workspace handle.
 */
function deriveFromWorkspace(workspace: StudioWorkspaceHandle): {
  config: SanityConfig
  sources: Record<string, DocumentSource>
} {
  return {
    config: {
      defaultSource: {projectId: workspace.projectId, dataset: workspace.dataset},
      studio: {
        authenticated: workspace.authenticated,
        auth: workspace.auth.token ? {token: workspace.auth.token} : undefined,
      },
    },
    sources: {
      [DEFAULT_SOURCE_NAME]: {projectId: workspace.projectId, dataset: workspace.dataset},
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
 * The `config` prop accepts a {@link SanityConfig} object. Use the `sources` prop to declare
 * one or more named data sources for your app.
 *
 * When rendered inside a Sanity Studio that provides `SDKStudioContext`, the `config` and `sources`
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
 *       sources={{
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
 * @example Multiple sources
 * ```tsx
 * import { SanityApp } from '@sanity/sdk-react'
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp
 *       sources={{
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
  sources: sourcesProp,
  ...props
}: SanityAppProps): ReactElement {
  const studioWorkspace = useContext(SDKStudioContext)

  const derived = useMemo(() => {
    if (studioWorkspace && !configProp && !sourcesProp) {
      return deriveFromWorkspace(studioWorkspace)
    }
    return null
  }, [configProp, sourcesProp, studioWorkspace])

  const resolvedConfig = useMemo<SanityConfig>(() => {
    if (configProp) {
      if (!configProp.defaultSource && sourcesProp?.[DEFAULT_SOURCE_NAME]) {
        return {...configProp, defaultSource: sourcesProp[DEFAULT_SOURCE_NAME]}
      }
      return configProp
    }
    if (derived) return derived.config
    return {}
  }, [configProp, derived, sourcesProp])

  const resolvedSources = useMemo<Record<string, DocumentSource>>(() => {
    if (sourcesProp) return sourcesProp
    if (derived) return derived.sources
    return {}
  }, [sourcesProp, derived])

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
    <SDKProvider {...props} fallback={fallback} config={resolvedConfig} sources={resolvedSources}>
      {children}
    </SDKProvider>
  )
}
