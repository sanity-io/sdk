import {type DocumentResource, type SanityConfig} from '@sanity/sdk'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {SanityApp} from '../components/SanityApp'

interface RenderSanitySDKAppOptions {
  reactStrictMode?: boolean
}

interface NamedResourceEntry extends SanityConfig {
  resource?: DocumentResource
}

interface NamedResources {
  [key: string]: NamedResourceEntry
}

/**
 * Merges multiple named resource entries into a single config and resources map.
 * Each entry's `resource` is extracted into a `resources` map keyed by the entry name,
 * then the remaining config properties are shallow-merged (last config wins for
 * overlapping keys).
 */
function mergeNamedResources(namedResources: NamedResources): {
  config: SanityConfig
  resources: Record<string, DocumentResource>
} {
  const resources: Record<string, DocumentResource> = {}
  let mergedConfig: SanityConfig = {}

  for (const [name, entry] of Object.entries(namedResources)) {
    const {resource, ...rest} = entry
    mergedConfig = {...mergedConfig, ...rest}
    if (resource) {
      resources[name] = resource
    }
  }

  return {config: mergedConfig, resources}
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
  const {config, resources} = mergeNamedResources(namedResources)

  root.render(
    reactStrictMode ? (
      <StrictMode>
        <SanityApp config={config} resources={resources} fallback={<div>Loading...</div>}>
          {children}
        </SanityApp>
      </StrictMode>
    ) : (
      <SanityApp config={config} resources={resources} fallback={<div>Loading...</div>}>
        {children}
      </SanityApp>
    ),
  )

  return () => root.unmount()
}
