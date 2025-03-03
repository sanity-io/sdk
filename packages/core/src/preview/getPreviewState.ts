import {omit} from 'lodash-es'

import {type DatasetResourceId, type DocumentHandle} from '../documentList/documentListStore'
import {type SanityInstance} from '../instance/types'
import {createAction} from '../resources/createAction'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'
import {getPublishedId, insecureRandomId} from '../utils/ids'
import {
  previewStore,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from './previewStore'
import {STABLE_EMPTY_PREVIEW} from './util'

/**
 * @public
 */
export interface GetPreviewStateOptions {
  document: DocumentHandle
  datasetResourceId: DatasetResourceId
}

/**
 * @public
 */
export const getPreviewState = (
  instance: SanityInstance,
  {document, datasetResourceId}: GetPreviewStateOptions,
): StateSource<ValuePending<PreviewValue>> => {
  const _previewStore = previewStore(datasetResourceId)
  const _getPreviewState = createStateSourceAction(
    _previewStore,
    (state, {documentId}: {documentId: string}) => state.values[documentId] ?? STABLE_EMPTY_PREVIEW,
  )
  return createAction(_previewStore, ({state}) => {
    return function ({
      document: _document,
    }: GetPreviewStateOptions): StateSource<ValuePending<PreviewValue>> {
      const {_id, _type: documentType} = document
      const documentId = getPublishedId(_id)
      const previewState = _getPreviewState(this, {documentId: _id})

      return {
        ...previewState,
        subscribe: (subscriber: () => void) => {
          const subscriptionId = insecureRandomId()

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
              const previewValue = prevValue?.results ? prevValue.results : null

              return {
                subscriptions: hasSubscribers
                  ? {...prev.subscriptions, [documentId]: documentSubscriptions}
                  : omit(prev.subscriptions, documentId),
                values: hasSubscribers
                  ? prev.values
                  : {...prev.values, [documentId]: {results: previewValue, isPending: false}},
              }
            })
          }
        },
      } as StateSource<ValuePending<PreviewValue>>
    }
  })(instance, {document, datasetResourceId})
}
