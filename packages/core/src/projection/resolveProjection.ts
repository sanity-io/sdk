import {type DocumentHandle} from '../documentList/documentListStore'
import {type ActionContext, createAction} from '../resources/createAction'
import {getProjectionState} from './getProjectionState'
import {
  projectionStore,
  type ProjectionStoreState,
  type ProjectionValuePending,
} from './projectionStore'

interface ResolveProjectionOptions {
  document: DocumentHandle
  projection: string
}

/**
 * @beta
 */
export const resolveProjection = createAction(projectionStore, () => {
  return function <TResult extends Record<string, unknown> = Record<string, unknown>>(
    this: ActionContext<ProjectionStoreState>,
    {document, projection}: ResolveProjectionOptions,
  ): Promise<ProjectionValuePending<TResult>> {
    const {getCurrent, subscribe} = getProjectionState<TResult>(this, {document, projection})

    return new Promise<ProjectionValuePending<TResult>>((resolve) => {
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
