import {type DocumentResource} from '@sanity/sdk'

/**
 * The datasets the kitchensink reads in development. This module touches no browser globals, so
 * `sanity.cli.ts` can import it to generate types for the same datasets the app uses.
 */
export const datasetResources = {
  default: {projectId: 'ppsg7ml5', dataset: 'test'},
  secondary: {projectId: 'vo1ysemo', dataset: 'production'},
} as const satisfies Record<string, DocumentResource>
