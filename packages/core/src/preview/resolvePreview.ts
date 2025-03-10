import {type DocumentHandle} from '../document/patchOperations'
import {createAction} from '../resources/createAction'
import {getPreviewState} from './getPreviewState'
import {previewStore, type PreviewValue, type ValuePending} from './previewStore'

/**
 * @beta
 */
export interface ResolvePreviewOptions {
  document: DocumentHandle
}

/**
 * @beta
 */
export const resolvePreview = createAction(previewStore, () => {
  return function ({document}: ResolvePreviewOptions) {
    const {getCurrent, subscribe} = getPreviewState(this, {document})

    return new Promise<ValuePending<PreviewValue>>((resolve) => {
      const unsubscribe = subscribe(() => {
        const current = getCurrent()
        if (current?.results) {
          resolve(current)
          unsubscribe()
        }
      })
    })
  }
})
