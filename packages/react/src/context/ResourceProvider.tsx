import {createSanityInstance, type SanityConfig} from '@sanity/sdk'
import {Suspense, use, useEffect, useMemo, useRef} from 'react'

import {SanityInstanceContext} from './SanityInstanceContext'

const DEFAULT_FALLBACK = (
  <>
    Warning: No fallback provided. Please supply a fallback prop to ensure proper Suspense handling.
  </>
)

/**
 * Props for the ResourceProvider component
 * @public
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
 * @public
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
  ...config
}: ResourceProviderProps): React.ReactNode {
  const parent = use(SanityInstanceContext)
  const instance = useMemo(
    () => (parent ? parent.createChild(config) : createSanityInstance(config)),
    [config, parent],
  )

  // Ref to hold the scheduled disposal timer.
  const disposalTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // If the component remounts quickly (as in Strict Mode), cancel any pending disposal.
    if (disposalTimeout.current !== null) {
      clearTimeout(disposalTimeout.current)
      disposalTimeout.current = null
    }

    return () => {
      disposalTimeout.current = setTimeout(() => {
        if (!instance.isDisposed()) {
          instance.dispose()
        }
      }, 0)
    }
  }, [instance])

  return (
    <SanityInstanceContext.Provider value={instance}>
      <Suspense fallback={fallback ?? DEFAULT_FALLBACK}>{children}</Suspense>
    </SanityInstanceContext.Provider>
  )
}
