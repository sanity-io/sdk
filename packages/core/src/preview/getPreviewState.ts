import {omit} from 'lodash-es'

import {type DocumentHandle} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {getPublishedId, insecureRandomId} from '../utils/ids'
import {
  previewStore,
  type PreviewStoreState,
  type PreviewValue,
  type ValuePending,
} from './previewStore'
import {STABLE_EMPTY_PREVIEW} from './util'

/**
 * @beta
 */
export type GetPreviewStateOptions = DocumentHandle

/**
 * @beta
 */
export function getPreviewState<TResult extends object>(
  instance: SanityInstance,
  options: GetPreviewStateOptions,
): StateSource<ValuePending<TResult>>
/**
 * @beta
 */
export function getPreviewState(
  instance: SanityInstance,
  options: GetPreviewStateOptions,
): StateSource<ValuePending<PreviewValue>>
/**
 * @beta
 */
export function getPreviewState(
  ...args: Parameters<typeof _getPreviewState>
): StateSource<ValuePending<object>> {
  return _getPreviewState(...args)
}

/**
 * @beta
 */
export const _getPreviewState = bindActionByDataset(
  previewStore,
  createStateSourceAction({
    selector: (
      {state}: SelectorContext<PreviewStoreState>,
      docHandle: GetPreviewStateOptions,
    ): ValuePending<object> => state.values[docHandle.documentId] ?? STABLE_EMPTY_PREVIEW,
    onSubscribe: ({state}, docHandle: GetPreviewStateOptions) => {
      const subscriptionId = insecureRandomId()
      const documentId = getPublishedId(docHandle.documentId)

      state.set('addSubscription', (prev) => ({
        subscriptions: {
          ...prev.subscriptions,
          [documentId]: {
            ...prev.subscriptions[documentId],
            [subscriptionId]: true,
          },
        },
      }))

      return () => {
        state.set('removeSubscription', (prev): Partial<PreviewStoreState> => {
          const documentSubscriptions = omit(prev.subscriptions[documentId], subscriptionId)
          const hasSubscribers = !!Object.keys(documentSubscriptions).length
          const prevValue = prev.values[documentId]
          const previewValue = prevValue?.data ? prevValue.data : null

          return {
            subscriptions: hasSubscribers
              ? {...prev.subscriptions, [documentId]: documentSubscriptions}
              : omit(prev.subscriptions, documentId),
            values: hasSubscribers
              ? prev.values
              : {...prev.values, [documentId]: {data: previewValue, isPending: false}},
          }
        })
      }
    },
  }),
)
