import {type DatasetResourceId, type DocumentHandle} from '../documentList/documentListStore'
import {type SanityInstance} from '../instance/types'
import {createAction} from '../resources/createAction'
import {getPreviewState} from './getPreviewState'
import {previewStore, type PreviewValue, type ValuePending} from './previewStore'

/**
 * @public
 */
export interface ResolvePreviewOptions {
  document: DocumentHandle
  datasetResourceId: DatasetResourceId
}

/**
 * @public
 */
export const resolvePreview = createAction(previewStore('ppsg7ml5:test'), () => {
  return function ({document, datasetResourceId}: ResolvePreviewOptions) {
    const {getCurrent, subscribe} = getPreviewState(this as unknown as SanityInstance, {
      document,
      datasetResourceId,
    })

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
