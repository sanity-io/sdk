import {type DocumentHandle, type DocumentSource} from '@sanity/sdk'
/**
 * Document handle that optionally includes a source (e.g., media library source)
 */
export type DocumentHandleWithSource<
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> = DocumentHandle<TDocumentType, TDataset, TProjectId> & {
  source?: DocumentSource
}
