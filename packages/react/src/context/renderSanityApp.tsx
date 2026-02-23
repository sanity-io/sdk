import {type DocumentSource, type SanityConfig} from '@sanity/sdk'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {SanityApp} from '../components/SanityApp'

interface RenderSanitySDKAppOptions {
  reactStrictMode?: boolean
}

interface NamedSources {
  [key: string]: SanityConfig
}

/**
 * Merges multiple named SanityConfig objects into a single config
 * by combining their `sources` maps. Later entries override earlier
 * ones for the same source key.
 */
function mergeNamedSources(namedSources: NamedSources): SanityConfig {
  const mergedSources: Record<string, DocumentSource> = {}
  for (const cfg of Object.values(namedSources)) {
    if (cfg.sources) Object.assign(mergedSources, cfg.sources)
  }
  return {sources: mergedSources}
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
  const config = mergeNamedSources(namedSources)

  root.render(
    reactStrictMode ? (
      <StrictMode>
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
