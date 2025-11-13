import {type DocumentHandle, type DocumentSource} from '@sanity/sdk'

import {type DocumentHandleWithSource} from '../types'

// Internal constant for accessing source ID
const SOURCE_ID = '__sanity_internal_sourceId' as const

interface DashboardMessageResource {
  id: string
  type?: 'media-library' | 'canvas'
}

const isDocumentHandleWithSource = (
  documentHandle: DocumentHandle | DocumentHandleWithSource,
): documentHandle is DocumentHandleWithSource => {
  return 'source' in documentHandle
}

/** Currently only used for dispatching intents to the dashboard,
 * but could easily be extended to other dashboard hooks
 * @beta
 */
export function getResourceIdFromDocumentHandle(
  documentHandle: DocumentHandle | DocumentHandleWithSource,
): DashboardMessageResource {
  let source: DocumentSource | undefined

  const {projectId, dataset} = documentHandle
  if (isDocumentHandleWithSource(documentHandle)) {
    source = documentHandle.source
  }
  let resourceId: string = projectId + '.' + dataset
  let resourceType: 'media-library' | 'canvas' | undefined

  if (source) {
    const sourceId = (source as Record<string, unknown>)[SOURCE_ID]
    if (Array.isArray(sourceId)) {
      if (sourceId[0] === 'media-library' || sourceId[0] === 'canvas') {
        resourceType = sourceId[0] as 'media-library' | 'canvas'
        resourceId = sourceId[1] as string
      }
    } else if (sourceId && typeof sourceId === 'object' && 'projectId' in sourceId) {
      const datasetSource = sourceId as {projectId: string; dataset: string}
      // don't create type since it's ambiguous for project / dataset docs
      resourceId = `${datasetSource.projectId}.${datasetSource.dataset}`
    }
  }

  return {
    id: resourceId,
    type: resourceType,
  }
}
