import {type SanityInstance} from '@sanity/sdk'
import {createContext, type ReactElement} from 'react'

/**
 * @public
 */
export interface SanityProviderProps {
  children: React.ReactNode
  sanityInstance: SanityInstance
}

export const SanityInstanceContext = createContext<SanityInstance | null>(null)

/**
 * Top-level context provider that provides access to your Sanity configuration instance.
 * This must wrap any components making use of the Sanity SDK React hooks.
 * @internal
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
export const SanityProvider = ({children, sanityInstance}: SanityProviderProps): ReactElement => {
  return (
    <SanityInstanceContext.Provider value={sanityInstance}>
      {children}
    </SanityInstanceContext.Provider>
  )
}
