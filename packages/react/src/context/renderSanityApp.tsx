import {type SanityConfig} from '@sanity/sdk'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {SanityApp} from '../components/SanityApp'

interface RenderSanitySDKAppOptions {
  reactStrictMode?: boolean
}

/** In-flight CLI PR is using named sources since it's aspirational.
 *  We can transform the shape in this function until it's finalized.
 */
interface NamedSources {
  [key: string]: SanityConfig
}
/** @internal */
export function renderSanityApp(
  rootElement: HTMLElement | null,
  namedSources: NamedSources,
  options: RenderSanitySDKAppOptions,
  children: React.ReactNode,
): () => void {
  if (!rootElement) {
    throw new Error('Missing root element to mount application into')
  }
  const {reactStrictMode = false} = options

  const root = createRoot(rootElement)
  const config = Object.values(namedSources)

  root.render(
    reactStrictMode ? (
      <StrictMode>
        {/* TODO: think about a loading component we want to be "universal" */}
        <SanityApp config={config} fallback={<div>Loading...</div>}>
          {children}
        </SanityApp>
      </StrictMode>
    ) : (
      <SanityApp config={config} fallback={<div>Loading...</div>}>
        {children}
      </SanityApp>
    ),
  )

  return () => root.unmount()
}
