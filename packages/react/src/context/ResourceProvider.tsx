import {
  createSanityInstance,
  type DocumentResource,
  type SanityConfig,
  type SanityInstance,
} from '@sanity/sdk'
import {initTelemetry} from '@sanity/sdk/_internal'
import {useContext, useEffect, useMemo, useRef} from 'react'

import {ResourceContext} from './DefaultResourceContext'
import {PerspectiveContext} from './PerspectiveContext'
import {SanityInstanceProvider} from './SanityInstanceProvider'

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
   * The document resource for this subtree. Hooks that receive no explicit
   * resource or resourceName will use this value via ResourceContext.
   */
  resource?: DocumentResource
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
 * The ResourceProvider creates a Sanity instance and makes it available to all
 * child components via React context.
 *
 * Features:
 * - Automatically manages the lifecycle of Sanity instances
 * - Disposes instances when the component unmounts
 * - Includes a Suspense boundary for data loading
 *
 * @example
 * ```tsx
 * <ResourceProvider
 *   projectId="your-project-id"
 *   dataset="production"
 *   fallback={<LoadingSpinner />}
 * >
 *   <YourApp />
 * </ResourceProvider>
 * ```
 */
export function ResourceProvider({
  children,
  fallback,
  resource,
  ...config
}: ResourceProviderProps): React.ReactNode {
  const parentPerspective = useContext(PerspectiveContext)
  const instance = useMemo(() => createSanityInstance(config), [config])

  const projectId = config.projectId ?? ''
  useMemo(() => {
    if (projectId) initTelemetry(instance, projectId)
  }, [instance, projectId])

  // Ref to hold the scheduled disposal timer.
  const disposal = useRef<{
    instance: SanityInstance
    timeoutId: ReturnType<typeof setTimeout>
  } | null>(null)

  useEffect(() => {
    // If the component remounts quickly (as in Strict Mode), cancel any pending disposal.
    if (disposal.current !== null && instance === disposal.current.instance) {
      clearTimeout(disposal.current.timeoutId)
      disposal.current = null
    }

    return () => {
      disposal.current = {
        instance,
        timeoutId: setTimeout(() => {
          if (!instance.isDisposed()) {
            instance.dispose()
          }
        }, 0),
      }
    }
  }, [instance])

  return (
    <SanityInstanceProvider instance={instance} fallback={fallback ?? DEFAULT_FALLBACK}>
      <ResourceContext.Provider value={resource}>
        <PerspectiveContext.Provider value={config.perspective ?? parentPerspective}>
          {children}
        </PerspectiveContext.Provider>
      </ResourceContext.Provider>
    </SanityInstanceProvider>
  )
}
