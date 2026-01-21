import {
  type DocumentHandle,
  isCanvasSource,
  isDatasetSource,
  isMediaLibrarySource,
} from '@sanity/sdk'

import {useSource} from '../../context/useSource'

interface DashboardMessageResource {
  id: string
  type?: 'media-library' | 'canvas'
}
/** Currently only used for dispatching intents to the dashboard,
 * but could easily be extended to other dashboard hooks
 * @beta
 */
export function useResourceIdFromDocumentHandle(
  documentHandle: DocumentHandle,
): DashboardMessageResource {
  const source = useSource(documentHandle)
  const {projectId, dataset} = documentHandle
  let resourceId: string = ''
  let resourceType: 'media-library' | 'canvas' | undefined
  if (projectId && dataset) {
    resourceId = `${projectId}.${dataset}`
  }

  if (source) {
    if (isDatasetSource(source)) {
      resourceId = `${source.projectId}.${source.dataset}`
      resourceType = undefined
    } else if (isMediaLibrarySource(source)) {
      resourceId = source.mediaLibraryId
      resourceType = 'media-library'
    } else if (isCanvasSource(source)) {
      resourceId = source.canvasId
      resourceType = 'canvas'
    }
  }

  return {
    id: resourceId,
    type: resourceType,
  }
}
