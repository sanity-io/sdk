import {DocumentId, getPublishedId} from '@sanity/id-utils'
import {type SanityProjectionResult} from 'groq'
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
import {insecureRandomId} from '../utils/ids'
import {projectionStore} from './projectionStore'
import {type ProjectionStoreState, type ProjectionValuePending, type ValidProjection} from './types'
import {PROJECTION_STATE_CLEAR_DELAY, STABLE_EMPTY_PROJECTION, validateProjection} from './util'

export interface ProjectionOptions<
  TProjection extends ValidProjection = ValidProjection,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
> extends DocumentHandle<TDocumentType, TDataset, TProjectId> {
  projection: TProjection
}

/**
 * @beta
 */
export function getProjectionState<
  TProjection extends ValidProjection = ValidProjection,
  TDocumentType extends string = string,
  TDataset extends string = string,
  TProjectId extends string = string,
>(
  instance: SanityInstance,
  options: ProjectionOptions<TProjection, TDocumentType, TDataset, TProjectId>,
): StateSource<
  | ProjectionValuePending<
      SanityProjectionResult<TProjection, TDocumentType, `${TProjectId}.${TDataset}`>
    >
  | undefined
>

/**
 * @beta
 */
export function getProjectionState<TData extends object>(
  instance: SanityInstance,
  options: ProjectionOptions,
): StateSource<ProjectionValuePending<TData> | undefined>

/**
 * @beta
 */
export function getProjectionState(
  instance: SanityInstance,
  options: ProjectionOptions,
): StateSource<ProjectionValuePending<Record<string, unknown>> | undefined>

/**
 * @beta
 */
export function getProjectionState(
  ...args: Parameters<typeof _getProjectionState>
): ReturnType<typeof _getProjectionState> {
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
      options: ProjectionOptions<ValidProjection, string, string, string>,
    ): ProjectionValuePending<object> | undefined => {
      const documentId = getPublishedId(options.documentId as DocumentId)
      const configString = JSON.stringify({
        projection: options.projection,
        projectId: options.projectId,
        dataset: options.dataset,
        perspective: options.perspective,
      })
      const projectionHash = hashString(configString)
      return state.values[documentId]?.[projectionHash] ?? STABLE_EMPTY_PROJECTION
    },
    onSubscribe: ({state}, options: ProjectionOptions<ValidProjection, string, string, string>) => {
      const {projection, ...docHandle} = options
      const subscriptionId = insecureRandomId()
      const documentId = getPublishedId(docHandle.documentId as DocumentId)
      const validProjection = validateProjection(projection)

      // Create a configuration string that includes all relevant options
      const configString = JSON.stringify({
        projection: validProjection,
        projectId: docHandle.projectId,
        dataset: docHandle.dataset,
        perspective: docHandle.perspective,
      })
      const projectionHash = hashString(configString)

      state.set('addSubscription', (prev) => {
        const existingConfigs = prev.configs[documentId] || {}
        const existingProjections = prev.documentProjections[documentId] || {}
        const existingSubscriptions = prev.subscriptions[documentId] || {}
        const existingSubscriptionsForHash = existingSubscriptions[projectionHash] || {}

        const nextState = {
          documentProjections: {
            ...prev.documentProjections,
            [documentId]: {
              ...existingProjections,
              [projectionHash]: validProjection,
            },
          },
          subscriptions: {
            ...prev.subscriptions,
            [documentId]: {
              ...existingSubscriptions,
              [projectionHash]: {
                ...existingSubscriptionsForHash,
                [subscriptionId]: true,
              },
            },
          },
          configs: {
            ...prev.configs,
            [documentId]: {
              ...existingConfigs,
              [projectionHash]: {
                projectId: docHandle.projectId,
                dataset: docHandle.dataset,
                perspective: docHandle.perspective,
              },
            },
          },
        } as const

        return nextState as Partial<ProjectionStoreState>
      })

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
