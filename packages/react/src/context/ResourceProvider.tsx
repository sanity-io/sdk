import {
  createSanityInstance,
  type DatasetResource,
  type DocumentResource,
  isDatasetResource,
  type SanityConfig,
  type SanityInstance,
} from '@sanity/sdk'
import {initTelemetry} from '@sanity/sdk/_internal'
import {useContext, useEffect, useMemo, useRef, useState} from 'react'

import {ResourceContext} from './DefaultResourceContext'
import {PerspectiveContext} from './PerspectiveContext'
import {SanityInstanceContext} from './SanityInstanceContext'
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
   * The document resource (project/dataset, media library, or canvas)
   * for this subtree. Hooks that don't specify an explicit resource will
   * use this value.
   */
  resource?: DocumentResource
  /**
   * React node to show while content is loading.
   * Used as the fallback for the internal Suspense boundary.
   */
  fallback: React.ReactNode
  children: React.ReactNode
}

/**
 * Provides Sanity configuration to child components through React Context.
 *
 * @internal
 *
 * @example
 * ```tsx
 * <ResourceProvider
 *   resource={{ projectId: 'your-project-id', dataset: 'production' }}
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
  const parentResource = useContext(ResourceContext)
  const parentInstance = useContext(SanityInstanceContext)

  const {projectId, dataset, perspective} = config

  const [instance] = useState<SanityInstance>(() => parentInstance ?? createSanityInstance(config))

  const configResource: DatasetResource | undefined = useMemo(() => {
    if (projectId && dataset) {
      return {projectId, dataset}
    }
    return undefined
  }, [projectId, dataset])

  const effectiveResource = useMemo(() => {
    return resource ?? configResource ?? parentResource
  }, [resource, configResource, parentResource])

  useEffect(() => {
    if (effectiveResource && isDatasetResource(effectiveResource))
      initTelemetry(instance, effectiveResource.projectId)
  }, [instance, effectiveResource])

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
          // don't dispose the parent instance when this unmounts
          if (!instance.isDisposed() && instance !== parentInstance) {
            instance.dispose()
          }
        }, 0),
      }
    }
  }, [instance, parentInstance])

  return (
    <SanityInstanceProvider instance={instance} fallback={fallback ?? DEFAULT_FALLBACK}>
      <ResourceContext.Provider value={effectiveResource}>
        <PerspectiveContext.Provider value={perspective ?? parentPerspective}>
          {children}
        </PerspectiveContext.Provider>
      </ResourceContext.Provider>
    </SanityInstanceProvider>
  )
}
