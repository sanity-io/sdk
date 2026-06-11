import {type DocumentResource, type SanityConfig} from '@sanity/sdk'

// True when running against the e2e environment. The SANITY_APP_E2E_* vars are
// auto-exposed on import.meta.env by the App SDK's Vite config (SANITY_APP_ prefix).
export const isE2E = !!import.meta.env['SANITY_APP_E2E_MODE']

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

export const devResources: Record<string, DocumentResource> = {
  'media-library': {
    mediaLibraryId: isE2E ? import.meta.env['SANITY_APP_E2E_MEDIA_LIBRARY_ID'] : 'mlPGY7BEqt52',
  },
  'canvas': {
    canvasId: isE2E ? import.meta.env['SANITY_APP_E2E_CANVAS_ID'] : 'cag5gSK37IGV',
  },
}

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
