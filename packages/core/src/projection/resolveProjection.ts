import {type DocumentHandle} from '../documentList/documentListStore'
import {createAction} from '../resources/createAction'
import {getProjectionState} from './getProjectionState'
import {projectionStore, type ProjectionValuePending} from './projectionStore'

interface ResolveProjectionOptions {
  document: DocumentHandle
  projection: string
}

/**
 * @beta
 */
export const resolveProjection = createAction(projectionStore, () => {
  return function ({document, projection}: ResolveProjectionOptions) {
    const {getCurrent, subscribe} = getProjectionState(this, {document, projection})

    return new Promise<ProjectionValuePending<Record<string, unknown>>>((resolve) => {
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
