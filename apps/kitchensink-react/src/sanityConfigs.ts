import {type DocumentResource, type SanityConfig} from '@sanity/sdk'

// True when running against the e2e environment. The SANITY_APP_E2E_* vars are
// auto-exposed on import.meta.env by the App SDK's Vite config (SANITY_APP_ prefix).
export const isE2E = !!import.meta.env['SANITY_APP_E2E_MODE']

// True when the app is the top-level window rather than embedded in the Dashboard
// iframe. Webkit/Safari runs the e2e suite standalone (it can't execute scripts in
// the Dashboard's sandboxed iframe), while chromium/firefox run inside the Dashboard.
const isStandalone = window.self === window.top

export const devConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'vo1ysemo',
    dataset: 'production',
  },
]

export const e2eConfigs: SanityConfig[] = [
  {
    projectId: import.meta.env['SANITY_APP_E2E_PROJECT_ID'],
    dataset: import.meta.env['SANITY_APP_E2E_DATASET_0'],
    auth: {
      apiHost: 'https://api.sanity.work',
    },
  },
  {
    projectId: import.meta.env['SANITY_APP_E2E_PROJECT_ID'],
    dataset: import.meta.env['SANITY_APP_E2E_DATASET_1'],
    auth: {
      apiHost: 'https://api.sanity.work',
    },
  },
]

export const e2eResources: Record<string, DocumentResource> = {
  // Standalone runs (webkit/Safari) have no Dashboard org context, so `inferMediaLibraryAndCanvas`
  // can't resolve anything — provide the media library and canvas resources explicitly.
  // Otherewise, omit these so we can ensure that inferMediaLibraryAndCanvas is e2e tested.
  ...(isStandalone && {
    'media-library': {mediaLibraryId: import.meta.env['SANITY_APP_E2E_MEDIA_LIBRARY_ID']},
    'canvas': {canvasId: import.meta.env['SANITY_APP_E2E_CANVAS_ID']},
  }),
}
