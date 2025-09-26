import {createSanityInstance, type SanityConfig, type SanityInstance, sourceFor} from '@sanity/sdk'
import {type ReactElement, type ReactNode, Suspense, useEffect, useMemo, useRef} from 'react'

import {DefaultSourceContext} from '../context/DefaultSourceContext'
import {PerspectiveContext} from '../context/PerspectiveContext'
import {SanityInstanceContext} from '../context/SanityInstanceContext'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'

/**
 * @internal
 */
export interface SDKProviderProps extends AuthBoundaryProps {
  children: ReactNode
  config: SanityConfig | SanityConfig[]
  fallback: ReactNode
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 * Creates a hierarchy of ResourceProviders, each providing a SanityInstance that can be
 * accessed by hooks. The first configuration in the array becomes the default instance.
 */
export function SDKProvider({
  children,
  config,
  fallback,
  ...props
}: SDKProviderProps): ReactElement {
  if (Array.isArray(config)) {
    // eslint-disable-next-line no-console
    console.warn(
      '<SDKProvider>: Multiple configs are no longer supported. Only the first one will be used.',
    )
  }

  const {projectId, dataset, perspective, ...mainConfig} = Array.isArray(config)
    ? config[0] || {}
    : config

  const instance = useMemo(() => createSanityInstance(mainConfig), [mainConfig])

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

  let result = (
    <SanityInstanceContext.Provider value={instance}>
      <Suspense fallback={fallback}>
        <AuthBoundary {...props}>{children}</AuthBoundary>
      </Suspense>
    </SanityInstanceContext.Provider>
  )

  if (perspective) {
    result = <PerspectiveContext.Provider value={perspective}>{result}</PerspectiveContext.Provider>
  }

  if (projectId || dataset) {
    if (!(projectId && dataset)) {
      throw new Error('SDKProvider requires either both of projectId/dataset or none.')
    }

    result = (
      <DefaultSourceContext.Provider value={sourceFor({projectId, dataset})}>
        {result}
      </DefaultSourceContext.Provider>
    )
  }

  return result
}
