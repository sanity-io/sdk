import {omit} from 'lodash-es'

import {type DocumentHandle} from '../document/patchOperations'
import {type SanityInstance} from '../instance/types'
import {type ActionContext, createAction} from '../resources/createAction'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'
import {getPublishedId, insecureRandomId} from '../utils/ids'
import {
  projectionStore,
  type ProjectionStoreState,
  type ProjectionValuePending,
  type ValidProjection,
} from './projectionStore'
import {STABLE_EMPTY_PROJECTION, validateProjection} from './util'

interface GetProjectionStateOptions {
  document: DocumentHandle
  projection: ValidProjection
}

const getProjectStateSourceAction = createStateSourceAction(
  projectionStore,
  (state, {document}: GetProjectionStateOptions): ProjectionValuePending<object> =>
    state.values[document._id] ?? STABLE_EMPTY_PROJECTION,
)

/**
 * @beta
 */
export function getProjectionState<TResult extends object>(
  instance: SanityInstance | ActionContext<ProjectionStoreState>,
  options: GetProjectionStateOptions,
): StateSource<ProjectionValuePending<TResult>>
/**
 * @beta
 */
export function getProjectionState(
  instance: SanityInstance | ActionContext<ProjectionStoreState>,
  options: GetProjectionStateOptions,
): StateSource<ProjectionValuePending<Record<string, unknown>>>
/**
 * @beta
 */
export function getProjectionState(
  ...args: Parameters<typeof _getProjectionState>
): StateSource<ProjectionValuePending<object>> {
  return _getProjectionState(...args)
}

/**
 * @beta
 */
export const _getProjectionState = createAction(projectionStore, ({state}) => {
  return function ({
    document,
    projection,
  }: GetProjectionStateOptions): StateSource<ProjectionValuePending<object>> {
    const {_id} = document
    const documentId = getPublishedId(_id)
    const projectionState = getProjectStateSourceAction(this, {document, projection})

    return {
      ...projectionState,
      subscribe: (subscriber) => {
        const subscriptionId = insecureRandomId()

        state.set('addSubscription', (prev) => ({
          documentProjections: {
            ...prev.documentProjections,
            [documentId]: validateProjection(projection),
          },
          subscriptions: {
            ...prev.subscriptions,
            [documentId]: {
              ...prev.subscriptions[documentId],
              [subscriptionId]: true,
            },
          },
        }))

        const unsubscribe = projectionState.subscribe(subscriber)

        return () => {
          unsubscribe()

          state.set('removeSubscription', (prev): Partial<ProjectionStoreState> => {
            const documentSubscriptions = omit(prev.subscriptions[documentId], subscriptionId)
            const hasSubscribers = !!Object.keys(documentSubscriptions).length
            const prevValue = prev.values[documentId]
            const projectionValue = prevValue?.results ? prevValue.results : null

            return {
              subscriptions: hasSubscribers
                ? {...prev.subscriptions, [documentId]: documentSubscriptions}
                : omit(prev.subscriptions, documentId),
              values: hasSubscribers
                ? prev.values
                : {...prev.values, [documentId]: {results: projectionValue, isPending: false}},
            }
          })
        }
      },
    }
  }
})
