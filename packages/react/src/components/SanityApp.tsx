import {createSanityInstance, type SanityConfig} from '@sanity/sdk'
import {type ReactElement} from 'react'

import {SanityProvider} from '../context/SanityProvider'
import {AuthBoundary} from './auth/AuthBoundary'

/**
 * @public
 */
export interface SanityAppProps {
  sanityConfig: SanityConfig
  children: React.ReactNode
}

/**
 * @public
 *
 * The SanityApp component provides your Sanity application with access to your Sanity configuration,
 * as well as application context and state which is used by the Sanity React hooks. Your application
 * must be wrapped with the SanityApp component to function properly.
 *
 * @param props - Your Sanity configuration and the React children to render
 * @returns Your Sanity application, integrated with your Sanity configuration and application context
 *
 * @example
 * ```
 * import { SanityApp } from '@sanity/sdk-react
 *
 * import MyAppRoot from './Root'
 *
 * const mySanityConfig = {
 *   procectId: 'my-project-id',
 *   dataset: 'production',
 * }
 *
 * export default function MyApp() {
 *   return (
 *     <SanityApp sanityConfig={mySanityConfig}>
 *       <MyAppRoot />
 *     </SanityApp>
 *   )
 * }
 * ```
 */
export function SanityApp({sanityConfig, children}: SanityAppProps): ReactElement {
  const sanityInstance = createSanityInstance(sanityConfig)

  return (
    <SanityProvider sanityInstance={sanityInstance}>
      <AuthBoundary>{children}</AuthBoundary>
    </SanityProvider>
  )
}
