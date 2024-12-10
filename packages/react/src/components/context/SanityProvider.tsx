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
 * Top-level context provider that provides a Sanity configuration instance.
 * This must wrap any Sanity SDK React component.
 * @public
 * @param props - Sanity project and dataset configuration
 * @returns Rendered component
 * @example
 * ```tsx
 * import {createSanityInstance} from '@sanity/sdk'
 * import {ExampleComponent, SanityProvider} from '@sanity/sdk-react'
 *
 * const sanityInstance = createSanityInstance({projectId: 'your-project-id', dataset: 'production'})
 *
 * export default function MyApp() {
 *   return (
 *     <SanityProvider sanityInstance={sanityInstance}>
 *      <ExampleComponent />
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
