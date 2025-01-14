import {omit} from 'lodash-es'

import {type DocumentHandle} from '../documentList/documentListStore'
import {createAction} from '../resources/createAction'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'
import {
  previewStore,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from './previewStore'
import {getPublishedId, randomId, STABLE_EMPTY_PREVIEW} from './util'

/**
 * @public
 */
export interface GetPreviewStateOptions {
  document: DocumentHandle
}

const _getPreviewState = createStateSourceAction(
  previewStore,
  (state, {document}: GetPreviewStateOptions) => state.values[document._id] ?? STABLE_EMPTY_PREVIEW,
)

/**
 * @public
 */
export const getPreviewState = createAction(previewStore, ({state}) => {
  return function ({document}: GetPreviewStateOptions): StateSource<ValuePending<PreviewValue>> {
    const {_id, _type: documentType} = document
    const documentId = getPublishedId(_id)
    const previewState = _getPreviewState(this, {document})

    return {
      ...previewState,
      subscribe: (subscriber) => {
        const subscriptionId = randomId()

        state.set('addSubscription', (prev) => ({
          documentTypes: {
            ...prev.documentTypes,
            [documentId]: documentType,
          },
          subscriptions: {
            ...prev.subscriptions,
            [documentId]: {
              ...prev.subscriptions[documentId],
              [subscriptionId]: true,
            },
          },
        }))

        const unsubscribe = previewState.subscribe(subscriber)

        return () => {
          unsubscribe()

          state.set('removeSubscription', (prev): Partial<PreviewStoreState> => {
            const documentSubscriptions = omit(prev.subscriptions[documentId], subscriptionId)
            const hasSubscribers = !!Object.keys(documentSubscriptions).length
            const prevValue = prev.values[documentId]
            const previewValue = Array.isArray(prevValue) ? prevValue[0] : null

            return {
              subscriptions: hasSubscribers
                ? {...prev.subscriptions, [documentId]: documentSubscriptions}
                : omit(prev.subscriptions, documentId),
              values: hasSubscribers
                ? prev.values
                : {...prev.values, [documentId]: [previewValue, false]},
            }
          })
        }
      },
    }
  }
})
