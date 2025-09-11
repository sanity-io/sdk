import {type SanityConfig} from '@sanity/sdk'

export const devConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  {
    projectId: 'd45jg133',
    dataset: 'production',
  },
  {
    projectId: 'v28v5k8m',
    dataset: 'production',
  },
  {
    mediaLibraryId: 'mlPGY7BEqt52',
  },
]

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
