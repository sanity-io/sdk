import {omit} from 'lodash-es'

import {type DocumentHandle} from '../config/sanityConfig'
import {bindActionByDataset} from '../store/createActionBinder'
import {type SanityInstance} from '../store/createSanityInstance'
import {
  createStateSourceAction,
  type SelectorContext,
  type StateSource,
} from '../store/createStateSourceAction'
import {hashString} from '../utils/hashString'
import {getPublishedId, insecureRandomId} from '../utils/ids'
import {projectionStore} from './projectionStore'
import {type ProjectionStoreState, type ProjectionValuePending, type ValidProjection} from './types'
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
    ): ProjectionValuePending<object> => {
      const documentId = getPublishedId(options.documentId)
      const projectionHash = hashString(options.projection)
      return state.values[documentId]?.[projectionHash] ?? STABLE_EMPTY_PROJECTION
    },
    onSubscribe: ({state}, {projection, ...docHandle}: GetProjectionStateOptions) => {
      const subscriptionId = insecureRandomId()
      const documentId = getPublishedId(docHandle.documentId)
      const validProjection = validateProjection(projection)
      const projectionHash = hashString(validProjection)

      state.set('addSubscription', (prev) => ({
        documentProjections: {
          ...prev.documentProjections,
          [documentId]: {
            ...prev.documentProjections[documentId],
            [projectionHash]: validProjection,
          },
        },
        subscriptions: {
          ...prev.subscriptions,
          [documentId]: {
            ...prev.subscriptions[documentId],
            [projectionHash]: {
              ...prev.subscriptions[documentId]?.[projectionHash],
              [subscriptionId]: true,
            },
          },
        },
      }))

      return () => {
        setTimeout(() => {
          state.set('removeSubscription', (prev): Partial<ProjectionStoreState> => {
            const documentSubscriptionsForHash = omit(
              prev.subscriptions[documentId]?.[projectionHash],
              subscriptionId,
            )
            const hasSubscribersForProjection = !!Object.keys(documentSubscriptionsForHash).length

            const nextSubscriptions = {...prev.subscriptions}
            const nextDocumentProjections = {...prev.documentProjections}
            const nextValues = {...prev.values}

            // clean up the subscription and documentProjection if there are no subscribers
            if (!hasSubscribersForProjection) {
              delete nextSubscriptions[documentId]![projectionHash]
              delete nextDocumentProjections[documentId]![projectionHash]

              const currentProjectionValue = prev.values[documentId]?.[projectionHash]
              if (currentProjectionValue && nextValues[documentId]) {
                nextValues[documentId]![projectionHash] = {
                  data: currentProjectionValue.data,
                  isPending: false,
                }
              }
            } else {
              if (nextSubscriptions[documentId]) {
                nextSubscriptions[documentId]![projectionHash] = documentSubscriptionsForHash
              }
            }

            const hasAnySubscribersForDocument = Object.values(
              nextSubscriptions[documentId] ?? {},
            ).some((subs) => Object.keys(subs).length > 0)

            if (!hasAnySubscribersForDocument) {
              delete nextSubscriptions[documentId]
              delete nextDocumentProjections[documentId]
              // Keep nextValues[documentId] as cache
            }

            return {
              subscriptions: nextSubscriptions,
              documentProjections: nextDocumentProjections,
              values: nextValues,
            }
          })
        }, PROJECTION_STATE_CLEAR_DELAY)
      }
    },
  }),
)
