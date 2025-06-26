import {type SanityConfig} from '@sanity/sdk'
import {type EnhancedIntentHandlers, useDocumentPreview, useDocuments} from '@sanity/sdk-react'

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

// React component-based intent handlers that can use hooks
function HandleTranslation(payload: TranslationPayload): null {
  // eslint-disable-next-line no-console
  console.log('Handling translation intent:', payload)

  const {data: documents} = useDocuments({batchSize: 1})
  const firstDocument = documents?.[0]
  const preview = useDocumentPreview(firstDocument)
  // eslint-disable-next-line no-console
  console.log('First document preview:', preview)
  return null
}

// Traditional async intent handler
async function handlePreviewAsync(payload: PreviewPayload): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('Handling preview intent:', payload)
  // In a real app, this would open a preview window or navigate to a preview route
  // For example: navigate(`/preview/${payload.documentType}/${payload.documentId}`)
}

// Export intent handlers with explicit type discrimination
export const intentHandlers: EnhancedIntentHandlers = {
  handleTranslation: {
    type: 'component',
    handler: HandleTranslation,
  },
  handlePreview: {
    type: 'async',
    handler: handlePreviewAsync,
  },
}

export const devConfigs: SanityConfig[] = [
  {
    projectId: 'ppsg7ml5',
    dataset: 'test', // has movie types, but it's a scifi dataset
  },
  {
    projectId: 'd45jg133',
    dataset: 'production', // has movie types, but it's a documentary dataset
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
