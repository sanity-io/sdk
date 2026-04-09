import {type DocumentResource, type SanityConfig} from '@sanity/sdk-react'

export const devConfig: SanityConfig = {}

export const devResources: Record<string, DocumentResource> = {
  default: {projectId: 'ppsg7ml5', dataset: 'test'},
  secondary: {projectId: 'vo1ysemo', dataset: 'production'},
}

export const e2eConfig: SanityConfig = {
  auth: {
    apiHost: 'https://api.sanity.work',
  },
}

export const e2eResources: Record<string, DocumentResource> = {
  default: {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_0'],
  },
  secondary: {
    projectId: import.meta.env['VITE_E2E_PROJECT_ID'],
    dataset: import.meta.env['VITE_E2E_DATASET_1'],
  },
  // Webkit runs standalone (no dashboard org context), so the media library
  // resource is provided explicitly here instead of being inferred.
  // Chromium/Firefox run inside the dashboard and rely on inferMediaLibraryAndCanvas.
  ...(import.meta.env['VITE_E2E_MEDIA_LIBRARY_ID']
    ? {'media-library': {mediaLibraryId: import.meta.env['VITE_E2E_MEDIA_LIBRARY_ID']}}
    : {}),
}
