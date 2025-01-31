import {
  type ActionResult,
  createPatchFromDiff,
  editDocument,
  getDocumentState,
  resolveDocument,
} from '@sanity/sdk'
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
    (nextValue: unknown) => {
      if (path) {
        return apply(editDocument(documentId, {set: {[path]: nextValue}}))
      }

      const currentValue = getDocumentState(instance, documentId).getCurrent()
      const patches = createPatchFromDiff(currentValue, nextValue)
      return apply(patches.map((patch) => editDocument(documentId, patch)))
    },
    [apply, documentId, instance, path],
  )
}
