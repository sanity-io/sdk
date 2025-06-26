import {type SanityConfig} from '@sanity/sdk'

// Example payload types for different intents
interface TranslationPayload {
  text: string
  targetLanguage: string
  documentId?: string
}

interface PreviewPayload {
  documentId: string
  documentType: string
  revisionId?: string
}

// Example intent handlers
const handleTranslation = async (payload: TranslationPayload): Promise<void> => {
  // eslint-disable-next-line no-console
  console.log('Handling translation intent:', payload)
  // In a real app, this would integrate with a translation service
  // For example: await translateDocument(payload.documentId, payload.targetLanguage)
}

const handlePreview = async (payload: PreviewPayload): Promise<void> => {
  // eslint-disable-next-line no-console
  console.log('Handling preview intent:', payload)
  // In a real app, this would open a preview window or navigate to a preview route
  // For example: window.open(`/preview/${payload.documentType}/${payload.documentId}`)
}

export const devConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test',
    intentHandlers: {
      handleTranslation,
      handlePreview,
    },
  },
  {
    projectId: 'd45jg133',
    dataset: 'production',
    intentHandlers: {
      handleTranslation,
      handlePreview,
    },
  },
  {
    projectId: 'v28v5k8m',
    dataset: 'production',
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
