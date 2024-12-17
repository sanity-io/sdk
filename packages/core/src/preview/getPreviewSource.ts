import {omit} from 'lodash-es'

import type {DocumentHandle} from '../documentList/documentListStore'
import {createAction} from '../resources/createAction'
import {createStateSource, type StateSource} from '../resources/createStateSource'
import {getPreview} from './getPreview'
import {
  previewStore,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from './previewStore'
import {getPublishedId, randomId} from './util'

/**
 * @public
 */
export interface GetPreviewSourceOptions {
  document: DocumentHandle
}

/**
 * @public
 */
export const getPreviewSource = createAction(
  () => previewStore,
  ({state}) => {
    return function ({document}: GetPreviewSourceOptions): StateSource<ValuePending<PreviewValue>> {
      const {_id, _type: documentType} = document
      const documentId = getPublishedId(_id)
      const previewSource = createStateSource(state, () => getPreview(this, {document}))

      return {
        getCurrent: () => getPreview(this, {document}),
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

          const unsubscribe = previewSource.subscribe(subscriber)

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
  },
)
