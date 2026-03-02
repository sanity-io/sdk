import {
  type DocumentHandle,
  isCanvasResource,
  isDatasetResource,
  isMediaLibraryResource,
} from '@sanity/sdk'

import {
  useNormalizedResourceOptions,
  type WithResourceNameSupport,
} from '../../helpers/useNormalizedResourceOptions'

interface DashboardMessageResource {
  id: string
  type?: 'media-library' | 'canvas'
}
/** Currently only used for dispatching intents to the dashboard,
 * but could easily be extended to other dashboard hooks
 * @beta
 */
export function useResourceIdFromDocumentHandle(
  documentHandle: WithResourceNameSupport<DocumentHandle>,
): DashboardMessageResource {
  const options = useNormalizedResourceOptions(documentHandle)
  const {projectId, dataset, resource} = options
  let resourceId: string = ''
  let resourceType: 'media-library' | 'canvas' | undefined
  if (projectId && dataset) {
    resourceId = `${projectId}.${dataset}`
  }

  if (resource) {
    if (isDatasetResource(resource)) {
      resourceId = `${resource.projectId}.${resource.dataset}`
      resourceType = undefined
    } else if (isMediaLibraryResource(resource)) {
      resourceId = resource.mediaLibraryId
      resourceType = 'media-library'
    } else if (isCanvasResource(resource)) {
      resourceId = resource.canvasId
      resourceType = 'canvas'
    }
  }

  return {
    id: resourceId,
    type: resourceType,
  }
}
