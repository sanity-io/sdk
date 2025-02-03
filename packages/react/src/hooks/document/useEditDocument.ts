import {type ActionResult, editDocument, getDocumentState, resolveDocument} from '@sanity/sdk'
import {type SanityDocument} from '@sanity/types'
import {useCallback} from 'react'

import {useSanityInstance} from '../context/useSanityInstance'
import {useApplyActions} from './useApplyActions'

export function useEditDocument(
  documentId: string,
  path?: string,
): (nextValue: unknown) => Promise<ActionResult> {
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

      const current = getDocumentState(instance, documentId).getCurrent() as SanityDocument | null

      if (typeof next !== 'object' || !next) {
        throw new Error(
          `No path was provided to \`useEditDocument\` and the value provided was not a document object.`,
        )
      }

      const editActions = Object.entries(next)
        .filter(([key]) => !key.startsWith('_'))
        .filter(([key, value]) => current?.[key] !== value)
        .map(([key, value]) => editDocument(documentId, {set: {[key]: value}}))

      return apply(editActions)
    },
    [apply, documentId, instance, path],
  )
}
