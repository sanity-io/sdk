import {type DocumentSource, type SanityConfig} from '@sanity/sdk'

// Mirrors `app.id` in sanity.cli.ts. A future CLI release is expected to emit a
// generated module (alongside `.sanity/resources.ts`) that we can import here
// instead of hardcoding.
const APPLICATION_ID = 'wkyoigmzawwnnwx458zgoh46'

export const devConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
    applicationId: APPLICATION_ID,
  },
  {
    projectId: 'vo1ysemo',
    dataset: 'production',
    applicationId: APPLICATION_ID,
  },
]

export const devSources: Record<string, DocumentSource> = {
  'media-library': {
    mediaLibraryId: import.meta.env['VITE_IS_E2E']
      ? import.meta.env['VITE_E2E_MEDIA_LIBRARY_ID']
      : 'mlPGY7BEqt52',
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
