import {
  type ActionsResult,
  type DocumentHandle,
  editDocument,
  getDocumentState,
  type JsonMatch,
  type JsonMatchPath,
  resolveDocument,
} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyActions} from './useApplyActions'

const ignoredKeys = ['_id', '_type', '_createdAt', '_updatedAt', '_rev']

type Updater<TValue> = TValue | ((nextValue: TValue) => TValue)

/** @beta */
export function useEditDocument<
  TDocument extends SanityDocument,
  TPath extends JsonMatchPath<TDocument>,
>(
  doc: string | DocumentHandle<TDocument>,
  path: TPath,
): (nextValue: Updater<JsonMatch<TDocument, TPath>>) => Promise<ActionsResult<TDocument>>
/** @beta */
export function useEditDocument<TDocument extends SanityDocument>(
  doc: string | DocumentHandle<TDocument>,
): (nextValue: Updater<TDocument>) => Promise<ActionsResult<TDocument>>
/** @beta */
export function useEditDocument(
  doc: string | DocumentHandle,
  path?: string,
): (updater: Updater<unknown>) => Promise<ActionsResult> {
  const documentId = typeof doc === 'string' ? doc : doc._id
  const instance = useSanityInstance()
  const apply = useApplyActions()
  const isDocumentReady = useCallback(
    () => getDocumentState(instance, documentId).getCurrent() !== undefined,
    [instance, documentId],
  )
  if (!isDocumentReady()) throw resolveDocument(instance, documentId)

  return useCallback(
    (updater: Updater<unknown>) => {
      if (path) {
        const nextValue =
          typeof updater === 'function'
            ? updater(getDocumentState(instance, documentId, path).getCurrent())
            : updater

        return apply(editDocument(documentId, {set: {[path]: nextValue}}))
      }

      const current = getDocumentState(instance, documentId).getCurrent()
      const nextValue = typeof updater === 'function' ? updater(current) : updater

      if (typeof nextValue !== 'object' || !nextValue) {
        throw new Error(
          `No path was provided to \`useEditDocument\` and the value provided was not a document object.`,
        )
      }

      const allKeys = Object.keys({...current, ...nextValue})
      const editActions = allKeys
        .filter((key) => !ignoredKeys.includes(key))
        .filter((key) => current?.[key] !== nextValue[key])
        .map((key) =>
          key in nextValue
            ? editDocument(documentId, {set: {[key]: nextValue[key]}})
            : editDocument(documentId, {unset: [key]}),
        )

      return apply(editActions)
    },
    [apply, documentId, instance, path],
  )
}
