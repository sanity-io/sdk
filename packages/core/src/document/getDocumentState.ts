import type {SanityDocumentLike} from '@sanity/types'
import {omit} from 'lodash-es'

import type {SanityInstance} from '../instance/types'
import {randomId} from '../preview/util'
import type {ActionContext} from '../resources/createAction'
import {createStateSourceAction, type StateSource} from '../resources/createStateSourceAction'
import {type DocumentStoreState, getDocumentStore} from './documentStore'

const identity = (value: unknown) => value

const _getDocumentState = createStateSourceAction(getDocumentStore, {
  selector: (
    state: DocumentStoreState,
    documentId: string,
    documentSelector: (doc: SanityDocumentLike | null | undefined) => unknown,
  ) => {
    if (state.error) throw state.error
    return documentSelector(state.documents[documentId])
  },
  onSubscribe: ({state}, documentId) => {
    const subscriptionId = randomId()

    state.set('addDocumentSubscription', (prev) => ({
      subscriptions: {
        ...prev.subscriptions,
        [documentId]: [...(prev.subscriptions?.[documentId] ?? []), subscriptionId],
      },
    }))

    return () => {
      state.set('removeDocumentSubscription', (prev) => {
        const documentSubscriptions = prev.subscriptions[documentId]
        const nextSubscriptions = documentSubscriptions?.filter((id) => id !== subscriptionId)

        return {
          subscriptions: nextSubscriptions?.length
            ? {...prev.subscriptions, [documentId]: nextSubscriptions}
            : omit(prev.subscriptions, documentId),
        }
      })
    }
  },
})

/**
 * Returns a {@link StateSource} of the given document ID. Optionally accepts
 * a selector function for a more granular subscription.
 *
 * This state source will return `undefined` if the given document ID has not
 * yet loaded from content-lake yet and will return `null` if the document does
 * not exist in content lake yet.
 *
 * @beta
 */
export function getDocumentState<TDocument extends SanityDocumentLike, TSelection = unknown>(
  context: SanityInstance | ActionContext<DocumentStoreState>,
  documentId: string,
  documentSelector?: (doc: TDocument | null | undefined) => TSelection,
): StateSource<TSelection>
/** @alpha */
export function getDocumentState<TDocument extends SanityDocumentLike>(
  context: SanityInstance | ActionContext<DocumentStoreState>,
  documentId: string,
): StateSource<TDocument | null | undefined>
/** @alpha */
export function getDocumentState(
  context: SanityInstance | ActionContext<DocumentStoreState>,
  documentId: string,
  documentSelector: (doc: SanityDocumentLike | null | undefined) => unknown = identity,
): StateSource<unknown> {
  return _getDocumentState(context, documentId, documentSelector)
}
