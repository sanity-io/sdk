import {createSanityInstance, type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {type ReactElement, type ReactNode, Suspense, useEffect, useMemo, useRef} from 'react'

import {SanityInstanceContext} from '../context/SanityInstanceContext'
import {AuthBoundary, type AuthBoundaryProps} from './auth/AuthBoundary'

/**
 * @internal
 */
export interface SDKProviderProps extends AuthBoundaryProps {
  children: ReactNode
  config: SanityConfig
  fallback: ReactNode
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity SDK.
 * Creates a hierarchy of ResourceProviders, each providing a SanityInstance that can be
 * accessed by hooks. The first configuration in the array becomes the default instance.
 */
export function SDKProvider({children, config, fallback}: SDKProviderProps): ReactElement {
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
      <Suspense fallback={fallback}>
        <AuthBoundary>{children}</AuthBoundary>
      </Suspense>
    </SanityInstanceContext.Provider>
  )
}
