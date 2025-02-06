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

/** @beta */
export function useEditDocument<
  TDocument extends SanityDocument,
  TPath extends JsonMatchPath<TDocument>,
>(
  doc: string | DocumentHandle<TDocument>,
  path: TPath,
): (nextValue: JsonMatch<TDocument, TPath>) => Promise<ActionsResult<TDocument>>
/** @beta */
export function useEditDocument<TDocument extends SanityDocument>(
  doc: string | DocumentHandle<TDocument>,
): (nextValue: Partial<TDocument>) => Promise<ActionsResult<TDocument>>
/** @beta */
export function useEditDocument(
  doc: string | DocumentHandle,
  path?: string,
): (nextValue: unknown) => Promise<ActionsResult> {
  const documentId = typeof doc === 'string' ? doc : doc._id
  const instance = useSanityInstance()
  const apply = useApplyActions()
  const isDocumentReady = useCallback(
    () => getDocumentState(instance, documentId).getCurrent() !== undefined,
    [instance, documentId],
  )
  if (!isDocumentReady()) throw resolveDocument(instance, documentId)

  return useCallback(
    (next: unknown) => {
      if (path) {
        return apply(editDocument(documentId, {set: {[path]: next}}))
      }

      const current = getDocumentState(instance, documentId).getCurrent()

      if (typeof next !== 'object' || !next) {
        throw new Error(
          `No path was provided to \`useEditDocument\` and the value provided was not a document object.`,
        )
      }

      const editActions = Object.entries(next)
        .filter(([key]) => !ignoredKeys.includes(key))
        .filter(([key, value]) => current?.[key] !== value)
        .map(([key, value]) => editDocument(documentId, {set: {[key]: value}}))

      return apply(editActions)
    },
    [apply, documentId, instance, path],
  )
}
