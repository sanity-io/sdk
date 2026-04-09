import {type DocumentResource, type PerspectiveHandle, type ResourceName} from '@sanity/sdk'

// React-layer types — shadow core equivalents when imported from @sanity/sdk-react.
// resource is optional here and resolved from context by normalization,
// whereas core's DocumentHandle/ResourceHandle require resource explicitly.

/**
 * SDK React ResourceHandle with optional explicit resource field.
 * Resource is resolved from context when not provided.
 * When a `resourceName` is provided, the resource will be resolved from the context using the `ResourcesContext`,
 * if there is a matching resource by that name.
 * @public
 */
export interface ResourceHandle<
  TProjectId extends string = string,
  TDataset extends string = string,
> {
  resource?: DocumentResource<TProjectId, TDataset>
  resourceName?: ResourceName
  perspective?: PerspectiveHandle['perspective']
}

/**
 * SDK React DocumentTypeHandle with optional explicit resource field.
 * Resource is resolved from context when not provided.
 * When a `resourceName` is provided, the resource will be resolved from the context using the `ResourcesContext`,
 * if there is a matching resource by that name.
 * @public
 */
export interface DocumentTypeHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends ResourceHandle<TProjectId, TDataset> {
  documentType: TDocumentType
  documentId?: string
  liveEdit?: boolean
}

/**
 * SDK React DocumentHandle with optional explicit resource field.
 * Resource is resolved from context when not provided.
 * When a `resourceName` is provided, the resource will be resolved from the context using the `ResourcesContext`,
 * if there is a matching resource by that name.
 * @public
 */
export interface DocumentHandle<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentTypeHandle<TDocumentType, TDataset, TProjectId> {
  documentId: string
}
