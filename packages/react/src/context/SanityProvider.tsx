import {type SanityInstance} from '@sanity/sdk'
import {type ReactElement} from 'react'

import {SanityInstanceContext} from './SanityContext'

/**
 * @internal
 */
export interface SanityProviderProps {
  children: React.ReactNode
  sanityInstances: SanityInstance[]
}

/**
 * @internal
 *
 * Top-level context provider that provides access to the Sanity configuration instance.
 * This must wrap any components making use of the Sanity SDK React hooks.
 *
 * @remarks In most cases, SanityApp should be used rather than SanityProvider directly; SanityApp bundles both SanityProvider and an authentication layer.
 * @param props - Sanity project and dataset configuration
 * @returns Rendered component
 * @example
 * ```tsx
 * import {createSanityInstance} from '@sanity/sdk'
 * import {SanityProvider} from '@sanity/sdk-react'
 *
 * import MyAppRoot from './Root'
 *
 * const sanityInstance = createSanityInstance({
 *   projectId: 'your-project-id',
 *   dataset: 'production',
 * })
 *
 * export default function MyApp() {
 *   return (
 *     <SanityProvider sanityInstance={sanityInstance}>
 *       <MyAppRoot />
 *     </SanityProvider>
 *   )
 * }
 * ```
 */
export const SanityProvider = ({children, sanityInstances}: SanityProviderProps): ReactElement => {
  return (
    <SanityInstanceContext.Provider value={sanityInstances}>
      {children}
    </SanityInstanceContext.Provider>
  )
}
