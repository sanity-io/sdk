import {childSourceFor, type DocumentSource, type SanityConfig, sourceFor} from '@sanity/sdk'
import {Suspense, useContext} from 'react'

import {DefaultSourceContext} from './DefaultSourceContext'
import {PerspectiveContext} from './PerspectiveContext'

const DEFAULT_FALLBACK = (
  <>
    Warning: No fallback provided. Please supply a fallback prop to ensure proper Suspense handling.
  </>
)

/**
 * Props for the ResourceProvider component
 * @internal
 */
export interface ResourceProviderProps extends SanityConfig {
  /**
   * React node to show while content is loading
   * Used as the fallback for the internal Suspense boundary
   */
  fallback: React.ReactNode
  children: React.ReactNode
}

/**
 * Provides a Sanity instance to child components through React Context
 *
 * @internal
 *
 * @remarks
 * The ResourceProvider creates a hierarchical structure of Sanity instances:
 * - When used as a root provider, it creates a new Sanity instance with the given config
 * - When nested inside another ResourceProvider, it creates a child instance that
 *   inherits and extends the parent's configuration
 *
 * Features:
 * - Automatically manages the lifecycle of Sanity instances
 * - Disposes instances when the component unmounts
 * - Includes a Suspense boundary for data loading
 * - Enables hierarchical configuration inheritance
 *
 * Use this component to:
 * - Set up project/dataset configuration for an application
 * - Override specific configuration values in a section of your app
 * - Create isolated instance hierarchies for different features
 *
 * @example Creating a root provider
 * ```tsx
 * <ResourceProvider
 *   projectId="your-project-id"
 *   dataset="production"
 *   fallback={<LoadingSpinner />}
 * >
 *   <YourApp />
 * </ResourceProvider>
 * ```
 *
 * @example Creating nested providers with configuration inheritance
 * ```tsx
 * // Root provider with production config with nested provider for preview features with custom dataset
 * <ResourceProvider projectId="abc123" dataset="production" fallback={<Loading />}>
 *   <div>...Main app content</div>
 *   <Dashboard />
 *   <ResourceProvider dataset="preview" fallback={<Loading />}>
 *     <PreviewFeatures />
 *   </ResourceProvider>
 * </ResourceProvider>
 * ```
 */
export function ResourceProvider({
  children,
  fallback,
  perspective,
  projectId,
  dataset,
  ...config
}: ResourceProviderProps): React.ReactNode {
  const restKeys = Object.keys(config)
  if (restKeys.length > 0) {
    const listFormatter = new Intl.ListFormat('en', {style: 'long', type: 'conjunction'})
    // eslint-disable-next-line no-console
    console.warn(
      `ResourceProvider contains deprecated props: ${listFormatter.format(restKeys)}. ` +
        `Allowed keys are: ${listFormatter.format(['projectId', 'dataset', 'perspective', 'fallback'])}.`,
    )
  }

  const parentSource = useContext(DefaultSourceContext)

  let result = <Suspense fallback={fallback ?? DEFAULT_FALLBACK}>{children}</Suspense>

  if (perspective) {
    result = <PerspectiveContext.Provider value={perspective}>{result}</PerspectiveContext.Provider>
  }

  let defaultSource: DocumentSource | undefined
  if (projectId && dataset) {
    defaultSource = sourceFor({projectId, dataset})
  } else if (projectId || dataset) {
    if (!parentSource)
      throw new Error(
        `ResourceProvider given one of projectId/dataset, but no default source exists.`,
      )

    defaultSource = childSourceFor(parentSource, {
      projectId,
      dataset,
    })
  }

  if (defaultSource) {
    result = (
      <DefaultSourceContext.Provider value={defaultSource}>{result}</DefaultSourceContext.Provider>
    )
  }

  return result
}
