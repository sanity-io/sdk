import {type DocumentHandle} from '../documentList/documentListStore'
import {createAction} from '../resources/createAction'
import {getPreviewState} from './getPreviewState'
import {previewStore, type PreviewValue, type ValuePending} from './previewStore'

/**
 * @public
 */
export interface ResolvePreviewOptions {
  document: DocumentHandle
}

/**
 * @public
 */
export const resolvePreview = createAction(previewStore, () => {
  return function ({document}: ResolvePreviewOptions) {
    const {getCurrent, subscribe} = getPreviewState(this, {document})

    return new Promise<ValuePending<PreviewValue>>((resolve) => {
      const unsubscribe = subscribe(() => {
        const current = getCurrent()
        if (current[0]) {
          resolve(current)
          unsubscribe()
        }
      })
    })
  }
})
