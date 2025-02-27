import {omit} from 'lodash-es'

import {type DocumentHandle} from '../documentList/documentListStore'
import {createAction} from '../resources/createAction'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'
import {getPublishedId, insecureRandomId} from '../utils/ids'
import {
  projectionStore,
  type ProjectionStoreState,
  type ProjectionValuePending,
} from './projectionStore'
import {STABLE_EMPTY_PROJECTION} from './util'

interface GetProjectionStateOptions {
  document: DocumentHandle
  projection: string
}

const _getProjectionState = createStateSourceAction(
  projectionStore,
  (state, {document}: GetProjectionStateOptions) =>
    state.values[document._id] ?? STABLE_EMPTY_PROJECTION,
)

/**
 * @beta
 */
export const getProjectionState = createAction(projectionStore, ({state}) => {
  return function ({
    document,
    projection,
  }: GetProjectionStateOptions): StateSource<ProjectionValuePending<Record<string, unknown>>> {
    const {_id} = document
    const documentId = getPublishedId(_id)
    const projectionState = _getProjectionState(this, {document, projection})

    return {
      ...projectionState,
      subscribe: (subscriber) => {
        const subscriptionId = insecureRandomId()

        state.set('addSubscription', (prev) => ({
          documentProjections: {
            ...prev.documentProjections,
            [documentId]: projection,
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
