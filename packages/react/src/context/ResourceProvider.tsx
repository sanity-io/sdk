import {
  createSanityInstance,
  type DocumentResource,
  type PerspectiveHandle,
  type SanityConfig,
  type SanityInstance,
} from '@sanity/sdk'
import {Suspense, useContext, useEffect, useMemo, useRef} from 'react'

import {ResourceContext} from './DefaultResourceContext'
import {PerspectiveContext} from './PerspectiveContext'
import {SanityInstanceContext} from './SanityInstanceContext'

const DEFAULT_FALLBACK = (
  <>
    Warning: No fallback provided. Please supply a fallback prop to ensure proper Suspense handling.
  </>
)

/**
 * Props for the ResourceProvider component.
 *
 * Extends `SanityConfig` (minus `defaultResource`) so new config fields are
 * automatically forwarded. The `resource` prop replaces `defaultResource`
 * with a name that better describes its role at the React layer.
 *
 * @internal
 */
export interface ResourceProviderProps extends Omit<SanityConfig, 'defaultResource'> {
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
 * @remarks
 * - **Root usage** (no parent instance): creates a `SanityInstance` with the
 *   given config and provides it via `SanityInstanceContext`.
 * - **Nested usage** (inside an existing provider): sets
 *   `ResourceContext` and `PerspectiveContext` so hooks in the subtree
 *   resolve the correct resource/perspective without creating a new instance.
 *
 * @example Root provider
 * ```tsx
 * <ResourceProvider
 *   resource={{ projectId: 'your-project-id', dataset: 'production' }}
 *   fallback={<LoadingSpinner />}
 * >
 *   <YourApp />
 * </ResourceProvider>
 * ```
 *
 * @example Nested override
 * ```tsx
 * <ResourceProvider
 *   resource={{ projectId: 'other-project', dataset: 'staging' }}
 *   fallback={<LoadingSpinner />}
 * >
 *   <SubSection />
 * </ResourceProvider>
 * ```
 */
export function ResourceProvider({
  children,
  fallback,
  resource,
  ...rest
}: ResourceProviderProps): React.ReactNode {
  const parent = useContext(SanityInstanceContext)
  const {perspective, auth, studio} = rest
  const config: SanityConfig = useMemo(
    () => ({perspective, auth, studio, defaultResource: resource}),
    [resource, perspective, auth, studio],
  )

  if (parent) {
    return (
      <NestedResourceProvider resource={resource} perspective={perspective} fallback={fallback}>
        {children}
      </NestedResourceProvider>
    )
  }

  return (
    <RootResourceProvider config={config} fallback={fallback}>
      {children}
    </RootResourceProvider>
  )
}

function RootResourceProvider({
  children,
  fallback,
  config,
}: {
  children: React.ReactNode
  fallback: React.ReactNode
  config: SanityConfig
}): React.ReactNode {
  const instance = useMemo(() => createSanityInstance(config), [config])

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
    <SanityInstanceContext.Provider value={instance}>
      <ResourceContext.Provider value={config.defaultResource}>
        <PerspectiveContext.Provider value={config.perspective}>
          <Suspense fallback={fallback ?? DEFAULT_FALLBACK}>{children}</Suspense>
        </PerspectiveContext.Provider>
      </ResourceContext.Provider>
    </SanityInstanceContext.Provider>
  )
}

function NestedResourceProvider({
  children,
  fallback,
  resource,
  perspective,
}: {
  children: React.ReactNode
  fallback: React.ReactNode
  resource?: DocumentResource
  perspective?: PerspectiveHandle['perspective']
}): React.ReactNode {
  const parentResource = useContext(ResourceContext)
  const parentPerspective = useContext(PerspectiveContext)

  const resolvedResource = resource ?? parentResource
  const resolvedPerspective = perspective ?? parentPerspective

  return (
    <ResourceContext.Provider value={resolvedResource}>
      <PerspectiveContext.Provider value={resolvedPerspective}>
        <Suspense fallback={fallback ?? DEFAULT_FALLBACK}>{children}</Suspense>
      </PerspectiveContext.Provider>
    </ResourceContext.Provider>
  )
}
