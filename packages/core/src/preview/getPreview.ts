import type {DocumentHandle} from '../documentList/documentListStore'
import {createAction} from '../resources/createAction'
import {previewStore} from './previewStore'
import {getPublishedId, STABLE_EMPTY_PREVIEW} from './util'

/**
 * @public
 */
export interface GetPreviewOptions {
  document: DocumentHandle
}

/**
 * @public
 */
export const getPreview = createAction(
  () => previewStore,
  ({state}) => {
    return function ({document}: GetPreviewOptions) {
      const documentId = getPublishedId(document._id)
      return state.get().values[documentId] ?? STABLE_EMPTY_PREVIEW
    }
  },
)
