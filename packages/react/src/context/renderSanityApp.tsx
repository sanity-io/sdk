import {type DocumentResource} from '@sanity/sdk'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {SanityApp} from '../components/SanityApp'

interface RenderSanitySDKAppOptions {
  reactStrictMode?: boolean
}

interface NamedResources {
  [key: string]: DocumentResource
}

/** @internal */
export function renderSanityApp(
  rootElement: HTMLElement | null,
  namedResources: NamedResources,
  options: RenderSanitySDKAppOptions,
  children: React.ReactNode,
): () => void {
  if (!rootElement) {
    throw new Error('Missing root element to mount application into')
  }
  const {reactStrictMode = false} = options

  const root = createRoot(rootElement)
  root.render(
    reactStrictMode ? (
      <StrictMode>
        {/* TODO: we should find some way to pass top-level config, like auth, from a flatfile */}
        <SanityApp resources={namedResources} fallback={<div>Loading...</div>}>
          {children}
        </SanityApp>
      </StrictMode>
    ) : (
      <SanityApp resources={namedResources} fallback={<div>Loading...</div>}>
        {children}
      </SanityApp>
    ),
  )

  return () => root.unmount()
}
