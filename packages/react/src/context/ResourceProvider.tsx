import {
  createSanityInstance,
  type DatasetResource,
  type DocumentResource,
  isDatasetResource,
  type SanityConfig,
  type SanityInstance,
} from '@sanity/sdk'
import {initTelemetry} from '@sanity/sdk/_internal'
import {useContext, useEffect, useMemo, useReducer, useRef, useState} from 'react'

import {ResourceContext} from './DefaultResourceContext'
import {PerspectiveContext} from './PerspectiveContext'
import {ProjectContext} from './ProjectContext'
import {SanityInstanceContext} from './SanityInstanceContext'
import {SanityInstanceProvider} from './SanityInstanceProvider'

const DEFAULT_FALLBACK = (
  <>
    Warning: No fallback provided. Please supply a fallback prop to ensure proper Suspense handling.
  </>
)

/**
 * Reuses the parent's instance, or owns one of its own.
 *
 * Effect cleanup can't tell an unmount from a hidden `<Activity>`, so hiding disposes an owned
 * instance too. It is replaced with a fresh one before the provider is shown again.
 */
function useInstance(parentInstance: SanityInstance | null, config: SanityConfig): SanityInstance {
  const [instance, setInstance] = useState<SanityInstance>(
    () => parentInstance ?? createSanityInstance(config),
  )
  const [, forceRerender] = useReducer((n: number) => n + 1, 0)
  const disposalTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Replace during render, not in an effect: children's effects run before ours, so they would
  // see the disposed instance first.
  if (instance.isDisposed() && instance !== parentInstance) {
    setInstance(parentInstance ?? createSanityInstance(config))
  }

  useEffect(() => {
    clearTimeout(disposalTimer.current)

    return () => {
      // Deferred so Strict Mode's instant unmount/remount cancels it above.
      disposalTimer.current = setTimeout(() => {
        // The parent provider owns its instance and disposes it itself.
        if (!instance.isDisposed() && instance !== parentInstance) {
          instance.dispose()
          // Showing a hidden <Activity> doesn't re-render it, so queue the swap while hidden.
          // A no-op after a real unmount, so no replacement instance is leaked.
          forceRerender()
        }
      }, 0)
    }
  }, [instance, parentInstance])

  return instance
}

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
  const parentProjectId = useContext(ProjectContext)

  const {projectId, dataset, perspective} = config

  const instance = useInstance(parentInstance, config)

  const configResource: DatasetResource | undefined = useMemo(() => {
    // Historically, we allowed asymmetric merging: If you provided JUST a dataset, we'd merge it with the parent projectId.
    //
    // This backwards-compatible merging should be removed in the next major version.
    if (projectId && dataset) return {projectId, dataset}
    if (dataset && parentProjectId) return {projectId: parentProjectId, dataset}
    return undefined
  }, [projectId, dataset, parentProjectId])

  const effectiveResource = useMemo(() => {
    if (resource) return resource
    if (configResource) return configResource
    // A projectId with no dataset historically created its own scope, so no resource is needed.
    if (projectId) return undefined
    return parentResource
  }, [resource, configResource, projectId, parentResource])

  // Historically, ResourceProviders allowed a bare `projectId` (no dataset, no resource to complete it) to be provided.
  // This keeps that behavior intact for backwards compatibility, even though we prefer resources everywhere.
  //
  // This should be removed in the next major version.
  const effectiveProjectId = useMemo(() => {
    if (effectiveResource && isDatasetResource(effectiveResource)) {
      return effectiveResource.projectId
    }
    return projectId ?? parentProjectId
  }, [effectiveResource, projectId, parentProjectId])

  useEffect(() => {
    if (effectiveResource && isDatasetResource(effectiveResource))
      initTelemetry(instance, effectiveResource.projectId)
  }, [instance, effectiveResource])

  return (
    <SanityInstanceProvider
      instance={instance}
      fallback={fallback === undefined ? DEFAULT_FALLBACK : fallback}
    >
      <ResourceContext.Provider value={effectiveResource}>
        <ProjectContext.Provider value={effectiveProjectId}>
          <PerspectiveContext.Provider value={perspective ?? parentPerspective}>
            {children}
          </PerspectiveContext.Provider>
        </ProjectContext.Provider>
      </ResourceContext.Provider>
    </SanityInstanceProvider>
  )
}
