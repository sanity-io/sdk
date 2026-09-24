import {
  type CanvasResource,
  type MediaResource,
  type StudioResource,
} from '@sanity/message-protocol'
import {type DocumentHandle, type FavoriteDocumentContext} from '@sanity/sdk'
import {type FavoriteDocument} from '@sanity/sdk/dashboard'
import {useMemo} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'

/**
 * Props shared by {@link useFavorite} and {@link useUpdateFavorite}: a document
 * handle plus the resource it lives in.
 *
 * @internal
 */
export interface UseFavoriteProps extends DocumentHandle {
  resourceId?: string
  resourceType: StudioResource['type'] | MediaResource['type'] | CanvasResource['type']
  /**
   * The name of the schema collection this document belongs to.
   * Typically is the name of the workspace when used in the context of a studio.
   */
  schemaName?: string
}

/**
 * Resolves {@link UseFavoriteProps} into the {@link FavoriteDocumentContext}
 * shared by the favorites fetcher and mutation, defaulting a studio `resourceId`
 * from the instance's project and dataset.
 *
 * @internal
 */
export function useFavoriteContext({
  documentId,
  documentType,
  projectId: paramProjectId,
  dataset: paramDataset,
  resourceId: paramResourceId,
  resourceType,
  schemaName,
}: UseFavoriteProps): FavoriteDocumentContext {
  const {config} = useSanityInstance()
  const projectId = paramProjectId ?? config?.projectId
  const dataset = paramDataset ?? config?.dataset

  if (resourceType === 'studio' && (!projectId || !dataset)) {
    throw new Error('projectId and dataset are required for studio resources')
  }
  const resourceId =
    resourceType === 'studio' && !paramResourceId ? `${projectId}.${dataset}` : paramResourceId

  if (!resourceId) {
    throw new Error('resourceId is required for media-library and canvas resources')
  }

  return useMemo(
    () => ({documentId, documentType, resourceId, resourceType, schemaName}),
    [documentId, documentType, resourceId, resourceType, schemaName],
  )
}

/**
 * Addresses a favorite on the message bus, where a studio travels as its dataset resource.
 *
 * @internal
 */
export function toFavoriteDocument(context: FavoriteDocumentContext): FavoriteDocument {
  return {
    id: context.documentId,
    type: context.documentType,
    resource: {
      id: context.resourceId,
      type: context.resourceType === 'studio' ? 'dataset' : context.resourceType,
      ...(context.schemaName ? {schemaName: context.schemaName} : {}),
    },
  }
}
