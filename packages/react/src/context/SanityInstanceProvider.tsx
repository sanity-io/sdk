import {type SanityInstance} from '@sanity/sdk'
import {Suspense} from 'react'

import {SanityInstanceContext} from './SanityInstanceContext'

/**
 * Props for the SanityInstanceProvider component
 * @public
 */
export interface SanityInstanceProviderProps {
  /**
   * A pre-created SanityInstance to provide to child components.
   * The caller owns the instance lifecycle — SanityInstanceProvider
   * will not dispose it on unmount.
   */
  instance: SanityInstance
  /**
   * React node to show while content is loading.
   * Used as the fallback for the internal Suspense boundary.
   */
  fallback: React.ReactNode
  children: React.ReactNode
}

/**
 * Provides an externally-created Sanity instance to child components through React Context.
 *
 * @internal
 *
 * @remarks
 * Unlike {@link ResourceProvider}, this component does not create or dispose a SanityInstance.
 * The caller is responsible for creating the instance via `createSanityInstance` and disposing
 * it when appropriate. This is useful when a non-React system layer (e.g. a state machine)
 * owns the instance and the React tree should consume it without managing its lifecycle.
 *
 * All SDK hooks (`useSanityInstance`, `useDocuments`, etc.) will read from the provided instance.
 *
 * @example Providing a pre-created instance
 * ```tsx
 * import { createSanityInstance, type SanityConfig } from '@sanity/sdk'
 * import { SanityInstanceProvider } from '@sanity/sdk-react'
 *
 * const config: SanityConfig = {
 *   projectId: 'my-project-id',
 *   dataset: 'production',
 * }
 *
 * const instance = createSanityInstance(config)
 *
 * function App() {
 *   return (
 *     <SanityInstanceProvider instance={instance} fallback={<div>Loading...</div>}>
 *       <MyApp />
 *     </SanityInstanceProvider>
 *   )
 * }
 * ```
 *
 * @category Components
 */
export function SanityInstanceProvider({
  instance,
  fallback,
  children,
}: SanityInstanceProviderProps): React.ReactNode {
  return (
    <SanityInstanceContext.Provider value={instance}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </SanityInstanceContext.Provider>
  )
}
