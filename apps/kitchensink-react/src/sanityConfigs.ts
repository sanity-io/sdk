import {type DocumentResource, type SanityConfig} from '@sanity/sdk-react'

export const devConfig: SanityConfig = {}
export const devOrgId = 'oblZgbTFj'

export const devResources: Record<string, DocumentResource> = {
  default: {projectId: 'ppsg7ml5', dataset: 'test'},
  secondary: {projectId: 'vo1ysemo', dataset: 'production'},
}

export const e2eConfig: SanityConfig = {
  auth: {
    apiHost: 'https://api.sanity.work',
  },
}
export const e2eOrgId: string = import.meta.env['VITE_E2E_ORGANIZATION_ID']

export const e2eResources: Record<string, DocumentResource> = {
  default: {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_0'],
  },
  secondary: {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_1'],
  },
}
