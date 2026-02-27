import {DEFAULT_RESOURCE_NAME, type DocumentResource, type SanityConfig} from '@sanity/sdk'
import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'

import {SanityApp} from '../components/SanityApp'

interface RenderSanitySDKAppOptions {
  reactStrictMode?: boolean
}

interface NamedResources {
  [key: string]: SanityConfig
}

/**
 * Merges multiple named SanityConfig objects into a single config.
 * Each entry's `defaultResource` is extracted into a `resources` map keyed by
 * the entry name, then the remaining config properties are shallow-merged
 * (last config wins for overlapping keys). The merged config's
 * `defaultResource` is set from `resources['default']` so the two stay in sync.
 */
function mergeNamedResources(namedResources: NamedResources): {
  config: SanityConfig
  resources: Record<string, DocumentResource>
} {
  const resources: Record<string, DocumentResource> = {}
  let mergedConfig: SanityConfig = {}

  for (const [name, cfg] of Object.entries(namedResources)) {
    const {defaultResource, ...rest} = cfg
    mergedConfig = {...mergedConfig, ...rest}
    if (defaultResource) {
      resources[name] = defaultResource
    }
  }

  const defaultResource = resources[DEFAULT_RESOURCE_NAME]
  if (defaultResource) {
    mergedConfig = {...mergedConfig, defaultResource}
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
