import {type DocumentSource} from '@sanity/sdk'

export const devConfigs: Record<string, DocumentSource> = {
  default: {
    projectId: 'vo1ysemo',
    dataset: 'production',
  },
  test: {
    projectId: 'ppsg7ml5',
    dataset: 'test',
  },
  media: {mediaLibraryId: 'mlPGY7BEqt52'},
}

export const e2eConfigs: Record<string, DocumentSource> = {
  default: {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_0'],
  },
  other: {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_1'],
  },
}
