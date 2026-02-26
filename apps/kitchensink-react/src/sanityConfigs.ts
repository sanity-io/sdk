import {type DocumentSource, type SanityConfig} from '@sanity/sdk'

export const devConfig: SanityConfig = {
  defaultSource: {projectId: 'ppsg7ml5', dataset: 'test'},
}

export const devSources: Record<string, DocumentSource> = {
  'default': {projectId: 'ppsg7ml5', dataset: 'test'},
  'secondary': {projectId: 'vo1ysemo', dataset: 'production'},
  'media-library': {
    mediaLibraryId: import.meta.env['VITE_IS_E2E']
      ? import.meta.env['VITE_E2E_MEDIA_LIBRARY_ID']
      : 'mlPGY7BEqt52',
  },
}

export const e2eConfig: SanityConfig = {
  defaultSource: {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_0'],
  },
  auth: {
    apiHost: 'https://api.sanity.work',
  },
}

export const e2eSources: Record<string, DocumentSource> = {
  'default': {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_0'],
  },
  'secondary': {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_1'],
  },
  'media-library': {
    mediaLibraryId: import.meta.env['VITE_IS_E2E']
      ? import.meta.env['VITE_E2E_MEDIA_LIBRARY_ID']
      : 'mlPGY7BEqt52',
  },
}
