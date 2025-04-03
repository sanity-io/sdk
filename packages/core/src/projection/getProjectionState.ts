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
  projectionStore,
  type ProjectionStoreState,
  type ProjectionValuePending,
  type ValidProjection,
} from './projectionStore'
import {PROJECTION_STATE_CLEAR_DELAY, STABLE_EMPTY_PROJECTION, validateProjection} from './util'

interface GetProjectionStateOptions extends DocumentHandle {
  projection: ValidProjection
}

/**
 * @beta
 */
export function getProjectionState<TResult extends object>(
  instance: SanityInstance,
  options: GetProjectionStateOptions,
): StateSource<ProjectionValuePending<TResult>>
/**
 * @beta
 */
export function getProjectionState(
  instance: SanityInstance,
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
export const _getProjectionState = bindActionByDataset(
  projectionStore,
  createStateSourceAction({
    selector: (
      {state}: SelectorContext<ProjectionStoreState>,
      options: GetProjectionStateOptions,
    ): ProjectionValuePending<object> =>
      state.values[options.documentId] ?? STABLE_EMPTY_PROJECTION,
    onSubscribe: ({state}, {projection, ...docHandle}: GetProjectionStateOptions) => {
      const subscriptionId = insecureRandomId()
      const documentId = getPublishedId(docHandle.documentId)

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

      return () => {
        setTimeout(() => {
          state.set('removeSubscription', (prev): Partial<ProjectionStoreState> => {
            const documentSubscriptions = omit(prev.subscriptions[documentId], subscriptionId)
            const hasSubscribers = !!Object.keys(documentSubscriptions).length
            const prevValue = prev.values[documentId]
            const projectionValue = prevValue?.data ? prevValue.data : null

            return {
              subscriptions: hasSubscribers
                ? {...prev.subscriptions, [documentId]: documentSubscriptions}
                : omit(prev.subscriptions, documentId),
              values: hasSubscribers
                ? prev.values
                : {...prev.values, [documentId]: {data: projectionValue, isPending: false}},
            }
          })
        }, PROJECTION_STATE_CLEAR_DELAY)
      }
    },
  }),
)
