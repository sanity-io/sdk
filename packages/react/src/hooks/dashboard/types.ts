import {type DocumentHandle, type DocumentSource} from '@sanity/sdk'
/**
 * Document handle that optionally includes a source (e.g., media library source)
 * or projectId and dataset for traditional dataset sources
 * (but now marked optional since it's valid to just use a source)
 * @beta
 */
export interface DocumentHandleWithSource extends Omit<DocumentHandle, 'projectId' | 'dataset'> {
  source?: DocumentSource
  projectId?: string
  dataset?: string
}
