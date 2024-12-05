import {createSanityInstance, type SanityConfig, type SanityInstance} from '@sanity/sdk'
import {createContext, type ReactElement} from 'react'

/**
 * @public
 */
export interface SanityProviderProps {
  children: React.ReactNode
  config: SanityConfig
}
type Instance = {
  sanityInstance: SanityInstance
}

export const SanityInstanceContext = createContext<Instance | null>(null)

/**
 * Top-level context provider that provides a Sanity configuration instance.
 * This must wrap any Sanity SDK React component.
 * @public
 * @param props - Sanity project and dataset configuration
 * @returns Rendered component
 * @example
 * ```tsx
 * import {ExampleComponent, SanityProvider} from @sanity/sdk-react'
 * const config = { projectId: 'your-project-id', dataset: 'production' }
 * return (
 * <SanityProvider config={config}>
 *  <ExampleComponent />
 * </SanityProvider>
 * )
 * ```
 */
export const SanityProvider = ({children, config}: SanityProviderProps): ReactElement => {
  const sanityInstance = createSanityInstance(config)

  return (
    <SanityInstanceContext.Provider value={{sanityInstance}}>
      {children}
    </SanityInstanceContext.Provider>
  )
}
