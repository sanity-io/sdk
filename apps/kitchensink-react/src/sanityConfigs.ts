import {type DocumentSource, type SanityConfig} from '@sanity/sdk'

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

export const devSources: Record<string, DocumentSource> = {
  'media-library': {
    mediaLibraryId: 'mlPGY7BEqt52',
  },
}

export const e2eConfigs: SanityConfig[] = [
  {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_0'],
    auth: {
      apiHost: 'https://api.sanity.work',
    },
  },
  {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_1'],
    auth: {
      apiHost: 'https://api.sanity.work',
    },
  },
]
