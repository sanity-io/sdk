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
 * Merges multiple named SanityConfig objects into a single config.
 * The last config wins for overlapping keys. The `defaultSource` from
 * each config is collected into a `sources` map keyed by the entry name,
 * and the final `defaultSource` is used as the merged config's default.
 */
function mergeNamedSources(namedSources: NamedSources): {
  config: SanityConfig
  sources: Record<string, DocumentSource>
} {
  const sources: Record<string, DocumentSource> = {}
  let mergedConfig: SanityConfig = {}

  for (const [, cfg] of Object.entries(namedSources)) {
    mergedConfig = {...mergedConfig, ...cfg}
  }

  for (const [name, cfg] of Object.entries(namedSources)) {
    if (cfg.defaultSource) {
      sources[name === 'main' ? 'default' : name] = cfg.defaultSource
    }
  }

  return {config: mergedConfig, sources}
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
  const {config, sources} = mergeNamedSources(namedSources)

  root.render(
    reactStrictMode ? (
      <StrictMode>
        <SanityApp config={config} sources={sources} fallback={<div>Loading...</div>}>
          {children}
        </SanityApp>
      </StrictMode>
    ) : (
      <SanityApp config={config} sources={sources} fallback={<div>Loading...</div>}>
        {children}
      </SanityApp>
    ),
  )

  return () => root.unmount()
}
